# Security notes

Do not commit `.env` files, Supabase service-role keys, private keys, signing certificates, simulator builds, or exported data. `.env.example` contains blank placeholders only.

Browser and mobile builds use the Supabase publishable/anon key. Authorization comes from Supabase Auth, PostgreSQL row-level security, and the guarded `fleet_action` RPC. Never replace the publishable key with a service-role key.

Before production deployment, review the Realtime policies, rotate any credential that may have been exposed outside this repository, and run a secret scanner against the complete Git history.
