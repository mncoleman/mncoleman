import type { Metadata } from 'next';
import { PageEntrance } from '@/components/page-entrance';

export const metadata: Metadata = {
  title: 'Privacy Policy | Matthew Coleman',
  description: 'How this website collects, uses, and protects your information.',
};

const LAST_UPDATED = 'September 27, 2026';

export default function PrivacyPolicyPage() {
  return (
    <PageEntrance>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <header className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </header>

        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <p>
            This Privacy Policy explains how this website (the &ldquo;Site&rdquo;), operated by
            Matthew Coleman, handles information when you visit. This is a personal website, and the
            Site is designed to collect as little personal information as possible.
          </p>

          <h2>Information We Collect</h2>
          <p>
            The Site does not require you to create an account or submit personal information to
            browse its content. We may collect limited information automatically, including:
          </p>
          <ul>
            <li>
              <strong>Usage and analytics data</strong> — such as pages visited, approximate
              location, browser type, device type, and referring pages. This is collected in
              aggregate to understand how the Site is used.
            </li>
            <li>
              <strong>Log data</strong> — standard information your browser sends with each request,
              such as your IP address, handled by our hosting provider.
            </li>
          </ul>

          <h2>How We Use Information</h2>
          <p>We use the limited information we collect to:</p>
          <ul>
            <li>Operate, maintain, and improve the Site and its content;</li>
            <li>Understand aggregate traffic patterns and how visitors engage with pages;</li>
            <li>Diagnose technical problems and protect the Site from misuse.</li>
          </ul>
          <p>We do not sell your personal information.</p>

          <h2>Cookies &amp; Analytics</h2>
          <p>
            The Site uses Google Analytics to measure aggregate traffic and improve the experience.
            Google Analytics sets its own cookies and processes data according to Google&apos;s privacy
            policy. You can control or disable cookies through your browser settings, or install
            Google&apos;s opt-out browser add-on; doing either will not prevent you from using the Site.
          </p>

          <h2>Third-Party Services</h2>
          <p>The Site relies on third-party services to function, which may process data on our behalf, including:</p>
          <ul>
            <li><strong>Hosting</strong> — the Site is served as a static site by our hosting provider.</li>
            <li><strong>Analytics</strong> — to measure aggregate usage, where enabled.</li>
            <li><strong>Content sources</strong> — some content is authored in third-party tools and published to the Site.</li>
          </ul>
          <p>
            We encourage you to review the privacy policies of any third-party service you interact
            with. We are not responsible for the practices of websites we link to.
          </p>

          <h2>Data Security</h2>
          <p>
            We take reasonable measures to protect the Site, but no method of transmission or storage
            over the internet is completely secure. We cannot guarantee absolute security.
          </p>

          <h2>Children&rsquo;s Privacy</h2>
          <p>
            The Site is not directed to children under the age of 13, and we do not knowingly collect
            personal information from children. If you believe a child has provided us with personal
            information, please contact us so we can address it.
          </p>

          <h2>Your Rights</h2>
          <p>
            Depending on where you live, you may have rights regarding your personal information, such
            as the right to access, correct, or delete it, or to opt out of certain processing. To
            exercise any of these rights, please contact us using the details below.
          </p>

          <h2 id="library">Library (library.mncoleman.com)</h2>
          <p>
            Library, the book-cataloging app at library.mncoleman.com (the &ldquo;Service&rdquo;),
            requires an account and so collects more than the rest of the Site. This section describes
            what it collects and why; the rest of this policy still applies.
          </p>
          <h3>What the Service collects</h3>
          <ul>
            <li>
              <strong>Account information</strong> &mdash; your email address, optional display name,
              and a securely hashed password. If you sign in with Google, we receive your Google account
              ID and verified email; with Telegram, an app-specific Telegram ID and username. We never
              receive your Google or Telegram password.
            </li>
            <li>
              <strong>Your library content</strong> &mdash; books you catalog, notes, tags, reading
              status, cover photos you upload, loan history, and the names and optional phone numbers or
              emails of borrowers you add. Borrower details are visible only to that library&rsquo;s
              librarians and owner.
            </li>
            <li>
              <strong>Billing information</strong> &mdash; payments are processed by Stripe. We store your
              Stripe customer ID, plan, and subscription status; we do not see or store your full card
              number.
            </li>
            <li>
              <strong>Referral information</strong> &mdash; who referred you (if you used a referral
              link), and a record of referral credit earned.
            </li>
            <li>
              <strong>Camera</strong> &mdash; the barcode and cover scanners use your device camera only
              while scanning. Video is processed on your device and is not uploaded; only a cover photo
              you choose to save is sent to our server.
            </li>
          </ul>
          <h3>How it&rsquo;s used and shared</h3>
          <p>
            We use this information only to run the Service: signing you in, showing your libraries to
            the people you&rsquo;ve given access, looking up book details, billing, and sending
            transactional email (invites, verification, password resets). We don&rsquo;t sell your data or
            use it for advertising. Service providers that process it on our behalf: <strong>Stripe</strong>{' '}
            (payments), <strong>Resend</strong> (email delivery), <strong>Google</strong> and{' '}
            <strong>Telegram</strong> (only if you choose to sign in with them), and{' '}
            <strong>Cloudflare</strong> (DNS). When you scan or look up a book, its ISBN is sent to{' '}
            <strong>Open Library</strong> and <strong>Google Books</strong> to fetch details; no personal
            information is included. Library content is stored on a server we operate, with nightly
            backups.
          </p>
          <h3>Public pages</h3>
          <p>
            If a library owner turns on a public page, that library&rsquo;s book titles, authors, covers,
            tags, and on-the-shelf/lent-out status are visible to anyone with the link. Public pages never
            show borrower names, notes, loan details, members, or anyone&rsquo;s reading status.
          </p>
          <h3>Cookies</h3>
          <p>
            The Service uses essential cookies only: a sign-in session, the library you currently have
            open, and short-lived cookies that carry a referral or promo code through sign-up. It does not
            use advertising or cross-site tracking cookies.
          </p>
          <h3>Retention and deletion</h3>
          <p>
            Your data is kept while your account is active. You can export your catalog at any time, and
            delete a library or your whole account from Settings; deletion removes that data from the live
            Service immediately and from backups within 14 days. Stripe retains payment records as required
            by law. Borrower records you created in someone else&rsquo;s library, and loan history there,
            stay with that library. To request access, correction, or deletion of your data, contact us
            at the address below.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be posted on this
            page with an updated &ldquo;Last updated&rdquo; date. Your continued use of the Site after
            changes are posted constitutes your acceptance of the revised policy.
          </p>

          <h2>Contact</h2>
          <p>
            If you have questions about this Privacy Policy, you can reach Matthew Coleman at{' '}
            <a href="mailto:mncoleman003@gmail.com">mncoleman003@gmail.com</a>.
          </p>
        </article>
      </div>
    </PageEntrance>
  );
}
