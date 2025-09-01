from django.shortcuts import render, HttpResponse

import stripe
from django.conf import settings
from django.contrib import messages
from django.db import models
from django.http import HttpRequest, HttpResponse, HttpResponseBadRequest, HttpResponseRedirect
from django.shortcuts import render, redirect
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from .models import Feature, UserFeature


def home(request):
    return render(request, "home.html")

def main(request):
    return render(request, "main.html")

stripe.api_key = settings.STRIPE_SECRET_KEY

# --- Helperi ---

def _active_feature_ids_for(user) -> set[int]:
    now = timezone.now()
    q = UserFeature.objects.filter(user=user, active=True).filter(
        models.Q(current_period_end__isnull=True) | models.Q(current_period_end__gt=now)
    )
    return set(q.values_list('feature_id', flat=True))


def _activate_features_for_user(user, feature_ids, subscription_id: str | None, current_period_end_ts: int | None, checkout_session_id: str | None = None):
    current_period_end = None
    if current_period_end_ts:
        current_period_end = timezone.datetime.fromtimestamp(current_period_end_ts, tz=timezone.utc)
    for fid in feature_ids:
        uf, _ = UserFeature.objects.get_or_create(user=user, feature_id=fid)
        uf.active = True
        if subscription_id:
            uf.subscription_id = subscription_id
        if checkout_session_id:
            uf.checkout_session_id = checkout_session_id
        if current_period_end:
            uf.current_period_end = current_period_end
        uf.save(update_fields=['active','subscription_id','checkout_session_id','current_period_end','updated_at'])

# --- В’юхи ---

def billing_page(request: HttpRequest) -> HttpResponse:
    features = list(Feature.objects.filter(is_active=True).order_by('title'))
    user_active = _active_feature_ids_for(request.user) if request.user.is_authenticated else set()
    for f in features:
        f.already_active = f.id in user_active
    return render(request, 'billing.html', {
        'features': features,
        'STRIPE_PUBLIC_KEY': settings.STRIPE_PUBLIC_KEY,
    })


def billing_checkout(request: HttpRequest) -> HttpResponse:
    if request.method != 'POST':
        return HttpResponseBadRequest('POST only')
    if not request.user.is_authenticated:
        return redirect('login')

    feature_ids_joined = request.POST.get('feature_ids_joined', '').strip()
    period = request.POST.get('period', 'month')  # 'month' | 'year'

    if not feature_ids_joined:
        messages.error(request, 'Оберіть принаймні одну функцію')
        return redirect('billing')
    try:
        ids = [int(x) for x in feature_ids_joined.split(',') if x]
    except ValueError:
        return HttpResponseBadRequest('Bad feature ids')

    features = list(Feature.objects.filter(id__in=ids, is_active=True))
    if not features:
        messages.error(request, 'Функції не знайдено')
        return redirect('billing')

    line_items = []
    for f in features:
        price_id = f.stripe_price_month_id if period == 'month' else f.stripe_price_year_id
        if not price_id:
            messages.error(request, f'Для "{f.title}" не налаштовано Stripe price для періоду {period}')
            return redirect('billing')
        line_items.append({'price': price_id, 'quantity': 1})

    success_url = request.build_absolute_uri(reverse('profile'))
    cancel_url = request.build_absolute_uri(reverse('billing'))

    session = stripe.checkout.Session.create(
        mode='subscription',
        line_items=line_items,
        success_url=success_url + '?paid=1',
        cancel_url=cancel_url,
        client_reference_id=str(request.user.id),
        metadata={
            'user_id': str(request.user.id),
            'feature_ids': ','.join(str(f.id) for f in features),
            'period': period,
        },
    )
    return HttpResponseRedirect(session.url)


@csrf_exempt
def stripe_webhook(request: HttpRequest) -> HttpResponse:
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    if not sig_header:
        return HttpResponseBadRequest('Missing signature')
    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=settings.STRIPE_WEBHOOK_SECRET,
        )
    except Exception:
        return HttpResponseBadRequest('Invalid payload or signature')

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session.get('client_reference_id') or (session.get('metadata') or {}).get('user_id')
        feature_ids = (session.get('metadata') or {}).get('feature_ids', '')
        subscription_id = session.get('subscription')

        current_period_end = None
        if subscription_id:
            try:
                sub = stripe.Subscription.retrieve(subscription_id)
                current_period_end = sub['current_period_end']
            except Exception:
                current_period_end = None

        if user_id and feature_ids:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                user = User.objects.get(id=int(user_id))
            except User.DoesNotExist:
                return HttpResponse(status=200)
            try:
                ids = [int(x) for x in feature_ids.split(',') if x]
            except ValueError:
                ids = []
            _activate_features_for_user(
                user=user,
                feature_ids=ids,
                subscription_id=subscription_id,
                current_period_end_ts=current_period_end,
                checkout_session_id=session.get('id'),
            )

    elif event['type'] in ('invoice.paid', 'customer.subscription.updated'):
        data = event['data']['object']
        subscription_id = data.get('subscription') or data.get('id')
        if not subscription_id:
            return HttpResponse(status=200)
        try:
            sub = stripe.Subscription.retrieve(subscription_id)
            current_period_end = sub['current_period_end']
            price_ids = [it['price']['id'] for it in sub['items']['data']]
        except Exception:
            return HttpResponse(status=200)

        features = Feature.objects.filter(
            models.Q(stripe_price_month_id__in=price_ids) | models.Q(stripe_price_year_id__in=price_ids)
        )
        ufs = UserFeature.objects.filter(subscription_id=subscription_id, feature__in=features)
        for uf in ufs:
            uf.active = True
            uf.current_period_end = timezone.datetime.fromtimestamp(current_period_end, tz=timezone.utc)
            uf.save(update_fields=['active','current_period_end','updated_at'])

    elif event['type'] in ('customer.subscription.deleted', 'invoice.payment_failed'):
        data = event['data']['object']
        subscription_id = data.get('id') or data.get('subscription')
        if subscription_id:
            UserFeature.objects.filter(subscription_id=subscription_id).update(active=False)

    return HttpResponse(status=200)


# (Опційно) Якщо хочете віддавати профіль через функцію, а не TemplateView
from django.contrib.auth.decorators import login_required

from django.db.models import Q
from django.utils import timezone
from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from .models import UserFeature

@login_required
def profile_view(request):
    now = timezone.now()
    ufs = (UserFeature.objects
           .select_related('feature')
           .filter(user=request.user, active=True)
           .filter(Q(current_period_end__isnull=True) | Q(current_period_end__gt=now)))

    paid_features = [{
        'title': uf.feature.title,
        'plan': '—',  # заповнимо пізніше
        'active': uf.active,
        'expires_at': uf.current_period_end,
    } for uf in ufs]

    # тимчасово: побачити в консолі, що функція справді викликається і що знайдено
    # print("PROFILE VIEW USED; count=", len(paid_features))

    return render(request, "profile.html", {"paid_features": paid_features})
