# Pearl Collections mobile app

This Expo app uses the same Supabase project as the website. It loads the active product catalog and stores signed-in customers' bag lines in `public.cart_items` through the existing `save_cart` RPC.

## Connect the app to Supabase

1. Copy `.env.example` to `.env` in this folder.
2. In Supabase, open **Project Settings → API**. Copy the project URL into `EXPO_PUBLIC_SUPABASE_URL` and the public anon/publishable key into `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Do not use a `service_role` or secret key in a mobile app.
3. In **Authentication → URL Configuration → Redirect URLs**, keep the website URLs and add:
   - `pearlcollections://auth/callback` for a built app.
   - `exp://**` while testing in Expo Go.
4. In the Supabase SQL Editor, run the migration in `../supabase/migrations/20261002170000_cart_realtime.sql`. It enables Realtime events for `cart_items`, so cart edits can move between the website and app.

## Open it on an Android phone

1. Install **Expo Go** from Google Play on the phone and connect the phone and PC to the same Wi-Fi.
2. In a terminal, change into this `mobile` folder and run `npm start`.
3. Scan the QR code with Expo Go.

Expo Go can be used for the first visual and catalog check. Google sign-in uses the app's deep link; if Expo Go does not return to the app on your device, we will use an EAS development build, which supports the registered `pearlcollections://` link.

## Current milestone

This first build includes Google sign-in, catalog browsing, variant selection, and a Supabase-backed shared bag. Mobile Paystack checkout and the payment return flow are a later milestone; the website's existing checkout remains the payment flow for now.
