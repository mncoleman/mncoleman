import type { Metadata } from 'next';
import { PageEntrance } from '@/components/page-entrance';

export const metadata: Metadata = {
  title: 'Terms of Service | Matthew Coleman',
  description: 'The terms and conditions that govern your use of this website.',
};

const LAST_UPDATED = 'September 27, 2026';

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

          <h2 id="library">Library (library.mncoleman.com)</h2>
          <p>
            Library is a book-cataloging and lending app operated by Matthew Coleman at
            library.mncoleman.com (the &ldquo;Service&rdquo;). This section applies to the Service in
            addition to the rest of these Terms; where they conflict, this section controls for the
            Service. The Service is offered for personal and small-organization use and, unlike the
            rest of the Site, may be used for non-personal purposes such as running a church, school,
            or community lending library.
          </p>
          <h3>Accounts</h3>
          <p>
            You must provide a valid email address and keep your sign-in credentials secure. You are
            responsible for activity under your account and in libraries you own, including the people
            you invite. You must be at least 13 years old to create an account. We may suspend or close
            accounts that violate these Terms.
          </p>
          <h3>Your content</h3>
          <p>
            You keep ownership of what you add to the Service &mdash; catalog entries, notes, tags,
            cover photos, and borrower details. You grant us a limited license to store, process, and
            display that content only as needed to operate the Service for you (for example, showing a
            library&rsquo;s catalog to its members, or on its public page if you turn one on). Only add
            borrower contact details you have permission to store. Book metadata and cover images
            retrieved from third-party sources (such as Open Library and Google Books) remain subject to
            those sources&rsquo; terms. You can export your catalog at any time and delete a library or
            your account from Settings.
          </p>
          <h3>Plans, billing, and renewal</h3>
          <p>
            Each library is on a plan: Personal (free, with limits on books and members), Family, or
            Full. Paid plans are subscriptions billed monthly or yearly in advance through our payment
            processor, Stripe, and <strong>renew automatically</strong> at the then-current price until
            you cancel. Family plans include a set number of members; adding members beyond that adds a
            per-member charge, which you confirm before it is added and which is prorated on your next
            bill. Prices are shown before you pay and may change with at least 30 days&rsquo; notice for
            existing subscriptions. Prices do not include taxes unless stated; if taxes apply they will be
            shown at checkout.
          </p>
          <h3>Cancellation and refunds</h3>
          <p>
            You can cancel anytime from Settings &rarr; Plan &amp; billing. Cancellation stops future
            renewals; you keep your paid plan until the end of the period you already paid for, after
            which the library moves to the free Personal plan. <strong>Payments are non-refundable</strong>,
            including for partial periods, except where required by law. If a library is over a plan&rsquo;s
            limits after a downgrade, nothing is deleted, but adding books, members, or loans is paused
            until it is back within the limits or upgraded. Complimentary plans granted by us may be
            changed or ended with reasonable notice.
          </p>
          <h3>Referral program (account credit)</h3>
          <p>
            You can share a referral link. People who create an account with your link receive 10% off
            their Service purchases while they remain subscribed. You earn <strong>account credit</strong>{' '}
            equal to 10% of the amount they actually pay (after discounts, excluding taxes).
            <strong> Referral credit is not cash, has no cash value, cannot be withdrawn, transferred, or
            exchanged, and can only be applied toward your own future Service charges.</strong> Credit is
            reversed if the underlying payment is refunded or charged back. Self-referrals, duplicate or
            fake accounts, and spam are not allowed; we may withhold or remove credit earned in violation
            of these Terms, and we may change or end the program at any time. Credit remaining when your
            account is closed is forfeited.
          </p>
          <h3>Coupons</h3>
          <p>
            Promotional codes are valid only as described when issued, may be limited in number of uses
            or by expiration date, cannot be combined with other discounts in a single checkout (the
            larger discount applies), and have no cash value.
          </p>
          <h3>Acceptable use</h3>
          <p>
            Don&rsquo;t use the Service to store unlawful content, infringe others&rsquo; rights, harass
            anyone, attempt to access libraries or data you haven&rsquo;t been given access to, overload
            or probe the Service, or resell it. Public library pages must not contain content you
            wouldn&rsquo;t want anyone on the internet to see.
          </p>
          <h3>Availability</h3>
          <p>
            We work to keep the Service available and your data backed up, but the Service is provided
            &ldquo;as is&rdquo; without guarantees of uninterrupted availability. The Disclaimer and
            Limitation of Liability sections above apply to the Service; to the extent permitted by law,
            our total liability for the Service is limited to the amount you paid us for it in the 12
            months before the claim.
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
