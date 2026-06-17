import type { Metadata } from 'next';
import { PageEntrance } from '@/components/page-entrance';

export const metadata: Metadata = {
  title: 'Terms of Service | Matthew Coleman',
  description: 'The terms and conditions that govern your use of this website.',
};

const LAST_UPDATED = 'June 16, 2026';

export default function TermsOfServicePage() {
  return (
    <PageEntrance>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <header className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </header>

        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of this
            website (the &ldquo;Site&rdquo;), operated by Matthew Coleman. By accessing or using the
            Site, you agree to be bound by these Terms. If you do not agree, please do not use the
            Site.
          </p>

          <h2>Use of the Site</h2>
          <p>
            You may access and use the Site for your personal, non-commercial use, subject to these
            Terms and applicable law. You agree not to use the Site in any way that could damage,
            disable, overburden, or impair it, or interfere with anyone else&rsquo;s use of it.
          </p>

          <h2>Intellectual Property</h2>
          <p>
            Unless otherwise noted, all content on the Site — including text, articles, graphics,
            logos, and design — is the property of Matthew Coleman and is protected by applicable
            intellectual property laws. You may view and share content for personal, non-commercial
            purposes with appropriate attribution, but you may not reproduce, republish, or
            distribute it for commercial purposes without prior written permission.
          </p>

          <h2>User Conduct</h2>
          <p>When using the Site, you agree not to:</p>
          <ul>
            <li>Violate any applicable law or regulation;</li>
            <li>Attempt to gain unauthorized access to any part of the Site or its systems;</li>
            <li>Use automated means to scrape or harvest content in a way that burdens the Site;</li>
            <li>Introduce malware or otherwise interfere with the Site&rsquo;s normal operation.</li>
          </ul>

          <h2>Third-Party Links</h2>
          <p>
            The Site may contain links to third-party websites or resources. These are provided for
            your convenience only. We do not control and are not responsible for the content,
            policies, or practices of any third-party sites, and linking to them does not imply our
            endorsement.
          </p>

          <h2>Disclaimer</h2>
          <p>
            The Site and all content are provided on an &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; basis without warranties of any kind, whether express or implied. We do
            not warrant that the Site will be uninterrupted, error-free, or free of harmful
            components, or that the content is accurate, complete, or current. Any opinions expressed
            on the Site are personal and do not constitute professional advice.
          </p>

          <h2>Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, Matthew Coleman shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or any loss of data,
            profits, or goodwill, arising out of or related to your use of (or inability to use) the
            Site.
          </p>

          <h2>Changes to These Terms</h2>
          <p>
            We may revise these Terms from time to time. Any changes will be posted on this page with
            an updated &ldquo;Last updated&rdquo; date. Your continued use of the Site after changes
            are posted constitutes your acceptance of the revised Terms.
          </p>

          <h2>Governing Law</h2>
          <p>
            These Terms are governed by and construed in accordance with the laws of the United
            States and the state in which Matthew Coleman resides, without regard to conflict of law
            principles.
          </p>

          <h2>Contact</h2>
          <p>
            If you have questions about these Terms, you can reach Matthew Coleman at{' '}
            <a href="mailto:mncoleman003@gmail.com">mncoleman003@gmail.com</a>.
          </p>
        </article>
      </div>
    </PageEntrance>
  );
}
