/* The brand, for the edge functions. They are deployed from
   supabase/functions/ and cannot read src/data/brand.json, so these
   four values are copied here; scripts/test-billing.mjs fails when they
   drift from that file, which stays the one place to change them. */
export const BRAND = {
  name: 'FilmMakerStudio',
  host: 'filmmakerstudio.in',
  supportEmail: 'support@filmmakerstudio.in',
  seller: 'Arun Kumar Mohanan'
};
