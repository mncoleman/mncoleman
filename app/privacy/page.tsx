import type { Metadata } from 'next';
import { PageEntrance } from '@/components/page-entrance';

export const metadata: Metadata = {
  title: 'Privacy Policy | Matthew Coleman',
  description: 'How this website collects, uses, and protects your information.',
};

const LAST_UPDATED = 'June 16, 2026';

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
            The Site may use cookies or similar technologies through analytics services (such as
            Google Analytics) to measure traffic and improve the experience. These services may set
            their own cookies and process data according to their own privacy policies. You can
            control or disable cookies through your browser settings; doing so will not prevent you
            from using the Site.
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
