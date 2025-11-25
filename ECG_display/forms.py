# ECG_display/forms.py
from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import get_user_model

User = get_user_model()

class SignUpForm(UserCreationForm):
    email = forms.EmailField(required=True, label="Email")
    first_name = forms.CharField(required=False, label="Ім'я")
    last_name = forms.CharField(required=False, label="Прізвище")

    class Meta:
        model = User
        fields = ("username", "email", "first_name", "last_name", "password1", "password2")
