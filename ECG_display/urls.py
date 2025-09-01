from django.urls import path
from django.contrib.auth import views as auth_views
from django.contrib.auth.decorators import login_required
from . import views

urlpatterns = [
    path("", views.main, name="main"),
    path("home", views.home, name="home"),

    # auth
    path("accounts/login/", auth_views.LoginView.as_view(
        template_name="login.html",
        redirect_authenticated_user=True,
    ), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),

    # password reset flow
    path("accounts/password-reset/", auth_views.PasswordResetView.as_view(
        template_name="registration/password_reset_form.html",
        email_template_name="registration/password_reset_email.html",
        subject_template_name="registration/password_reset_subject.txt",
    ), name="password_reset"),
    path("accounts/password-reset/done/", auth_views.PasswordResetDoneView.as_view(
        template_name="registration/password_reset_done.html",
    ), name="password_reset_done"),
    path("accounts/reset/<uidb64>/<token>/", auth_views.PasswordResetConfirmView.as_view(
        template_name="registration/password_reset_confirm.html",
    ), name="password_reset_confirm"),
    path("accounts/reset/done/", auth_views.PasswordResetCompleteView.as_view(
        template_name="registration/password_reset_complete.html",
    ), name="password_reset_complete"),

    # профіль — ТУТ МАЄ БУТИ САМЕ ВАША ФУНКЦІЯ
    path("accounts/profile/", login_required(views.profile_view), name="profile"),

    # billing
    path("billing/", login_required(views.billing_page), name="billing"),
    path("billing/checkout/", login_required(views.billing_checkout), name="billing_checkout"),
    path("stripe/webhook/", views.stripe_webhook, name="stripe_webhook"),
]
