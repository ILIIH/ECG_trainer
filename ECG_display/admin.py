from django.contrib import admin
from .models import Feature, UserFeature

# Register your models here.
@admin.register(Feature)
class FeatureAdmin(admin.ModelAdmin):
    list_display = ('title','slug','price_month','price_year','is_active')
    search_fields = ('title','slug')

@admin.register(UserFeature)
class UserFeatureAdmin(admin.ModelAdmin):
    list_display = ('user','feature','active','current_period_end','subscription_id')
    list_filter = ('active','feature')
    search_fields = ('user__username','user__email','subscription_id')