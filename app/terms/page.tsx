import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageShell } from '@/components/legal/LegalPageShell'

export const metadata: Metadata = {
  title: 'Terms of Service | Nutrafi Kitchen',
  description: 'Terms of service for the Nutrafi Kitchen staff portal and WhatsApp integration.',
}

export default function TermsOfServicePage() {
  return (
    <LegalPageShell title="Terms of Service" lastUpdated="June 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern use of the Nutrafi Kitchen internal portal
        and related integrations (including WhatsApp messaging via the Meta WhatsApp Business
        Platform). By accessing the portal, authorized users agree to these Terms.
      </p>

      <h2>Service description</h2>
      <p>
        The Nutrafi Kitchen portal is an internal business tool for meal subscription management,
        kitchen planning, customer records, reporting, and optional WhatsApp customer communication.
        It is not offered as a public-facing product to end consumers.
      </p>

      <h2>Authorized use</h2>
      <ul>
        <li>Access is limited to Nutrafi Kitchen staff and contractors with valid credentials.</li>
        <li>Users must keep login details confidential and use the portal only for work purposes.</li>
        <li>
          Users must not misuse customer data, attempt unauthorized access, or interfere with system
          security.
        </li>
      </ul>

      <h2>WhatsApp messaging</h2>
      <p>
        When WhatsApp is enabled, staff may send and receive messages through our integration with
        Meta&apos;s WhatsApp Business Platform. Users must comply with:
      </p>
      <ul>
        <li>WhatsApp Business Messaging Policy and applicable Meta platform terms</li>
        <li>UAE telecommunications and consumer protection laws</li>
        <li>Nutrafi Kitchen internal policies on customer communication</li>
      </ul>
      <p>
        Message fees, template rules, and delivery limits are set by Meta and may change. Nutrafi
        Kitchen is not responsible for outages or policy changes on Meta&apos;s platform.
      </p>

      <h2>Customer information</h2>
      <p>
        Customer data in the portal is owned and controlled by Nutrafi Kitchen. Staff must handle it
        accurately and only for legitimate business purposes. See our{' '}
        <Link href="/privacy">Privacy Policy</Link> for how data is handled.
      </p>

      <h2>Availability</h2>
      <p>
        We aim to keep the portal available but do not guarantee uninterrupted access. Maintenance,
        updates, or third-party failures (including Meta or hosting providers) may cause downtime.
      </p>

      <h2>Disclaimer</h2>
      <p>
        The portal is provided &quot;as is&quot; for internal business use. To the extent permitted by
        law, Nutrafi Kitchen disclaims warranties not required by applicable law and is not liable
        for indirect or consequential losses arising from portal use.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these Terms from time to time. Continued use after changes are posted
        constitutes acceptance of the updated Terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms:{' '}
        <a href="mailto:info@nutrafikitchen.com">info@nutrafikitchen.com</a> or +971 50 320 0510.
      </p>
    </LegalPageShell>
  )
}
