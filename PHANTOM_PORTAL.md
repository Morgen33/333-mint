# Phantom Portal — reduce "new domain" / scam warnings

Your Phantom App ID: **`85950ca1-bdc2-421a-a43a-d4aa9c90afb9`**

So Phantom recognizes the mint site as a verified app and doesn’t show “new domain” or scam-style warnings:

1. **Go to [phantom.app/portal](https://phantom.app/portal)** and sign in.
2. **Open the app** with the ID above (or create one and use this ID if it’s the same app).
3. **Set up the domain**
   - **Set up → Allowed origins**: add `https://333landingpage.vercel.app` (and `https://333collection.xyz` if you use it).
   - **Edit App Info → Public URL**: set to `https://333landingpage.vercel.app` (or your main mint URL).
4. **Verify the domain**
   - In **Edit App Info**, use **Domain verification**.
   - Add the **TXT** record Phantom gives you (e.g. `phantom-verification-XXXXX`) to your domain’s DNS (e.g. in Vercel Domains or your registrar).
   - Back in Phantom Portal, click **Verify domain** and wait for DNS to propagate (often 15–60 minutes).

After that, Phantom will treat your domain as verified for this app; the “new domain” warning usually goes away, and you’re set for production.

If the warning is still there after a week, use Phantom’s [domain review form](https://docs.google.com/forms/d/1JgIxdmolgh_80xMfQKBKx9-QPC7LRdN6LHpFFW8BlKM/viewform).
