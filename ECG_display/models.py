from __future__ import annotations
from django.db import models
from django.conf import settings
from django.utils import timezone


class Feature(models.Model):
    title = models.CharField(max_length=120)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)


    # Публічні ціни для відображення на сайті
    price_month = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    price_year = models.DecimalField(max_digits=10, decimal_places=2, default=0)


    # ID прайсів у Stripe (recurring prices)
    stripe_price_month_id = models.CharField(max_length=80, blank=True)
    stripe_price_year_id = models.CharField(max_length=80, blank=True)


    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


    def __str__(self) -> str:
        return self.title


class UserFeature(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    feature = models.ForeignKey(Feature, on_delete=models.CASCADE)


    active = models.BooleanField(default=False)
    current_period_end = models.DateTimeField(null=True, blank=True)


    subscription_id = models.CharField(max_length=120, blank=True) # sub_...
    checkout_session_id = models.CharField(max_length=120, blank=True) # cs_...


    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Meta:
    unique_together = ('user', 'feature')


def __str__(self) -> str:
    return f"{self.user} → {self.feature} ({'active' if self.active else 'inactive'})"


@property
def expired(self) -> bool:
    return bool(self.current_period_end and self.current_period_end < timezone.now())