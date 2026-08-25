# GROHE SpecBuilder — Multi-user setup

This build keeps the v18.4.6 product/selection application and adds Supabase authentication plus private per-user project storage.

## 1. Create a Supabase project
Create a project at Supabase, then open **SQL Editor** and run `SUPABASE_SETUP.sql`.

## 2. Configure browser login
In Supabase, open **Project Settings > API** and copy:
- Project URL
- anon / public key

Paste both into `supabase-config.js`.

The anon key is safe to place in a browser app. The SQL Row Level Security policies are what prevent one user from reading another user's projects.

## 3. Authentication settings
In Supabase **Authentication > Providers > Email**, enable Email/Password.

`allowSignUp: true` in `supabase-config.js` lets users create accounts from the login screen.
If accounts should be created only by an administrator, change it to `false` and create users from the Supabase dashboard.

## 4. GitHub Pages URL
In Supabase **Authentication > URL Configuration**:
- Set Site URL to your GitHub Pages multi-user URL.
- Add the same URL to Redirect URLs.

This is required for email confirmations and password-reset links.

## Result
- Every visitor must sign in before the application loads.
- Projects are stored in Supabase, not in a shared browser project database.
- Database RLS makes projects private to their owner.
- Profile settings include display name, email, password change and sign out.
- Catalogue/product data and existing v18.4.6 selection logic remain unchanged.
