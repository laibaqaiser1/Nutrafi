import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageShell } from '@/components/legal/LegalPageShell'

export const metadata: Metadata = {
  title: 'Privacy Policy | Nutrafi Kitchen',
  description: 'Privacy policy for the Nutrafi Kitchen staff portal and WhatsApp messaging integration.',
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="June 2026">
      <p>
        This Privacy Policy describes how Nutrafi Kitchen Restaurant (&quot;Nutrafi Kitchen&quot;,
        &quot;we&quot;, &quot;us&quot;) handles information when you use our internal meal management
        portal and related services, including WhatsApp messaging through the Meta WhatsApp Business
        Platform.
      </p>

      <h2>Who this applies to</h2>
      <p>
        This portal is for authorized Nutrafi Kitchen staff only. It is not a public consumer website.
        Customers may interact with us by phone or WhatsApp; their data may be stored in our systems
        as described below.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Staff accounts:</strong> name, email, login credentials, and role-based permissions.
        </li>
        <li>
          <strong>Customer records:</strong> names, phone numbers, delivery details, meal plan and
          order information entered by staff for kitchen operations.
        </li>
        <li>
          <strong>WhatsApp messages:</strong> when enabled, inbound and outbound WhatsApp messages
          (content, timestamps, phone numbers, delivery status) are stored in our portal inbox for
          customer support and meal-plan coordination.
        </li>
        <li>
          <strong>Technical data:</strong> standard server logs (IP address, browser type, request
          timestamps) for security and troubleshooting.
        </li>
      </ul>

      <h2>How we use information</h2>
      <p>We use this information to:</p>
      <ul>
        <li>Operate meal planning, kitchen planning, and customer management workflows</li>
        <li>Respond to customer WhatsApp inquiries and send operational updates</li>
        <li>Maintain security, audit access, and improve our internal tools</li>
        <li>Comply with applicable laws and business record-keeping requirements</li>
      </ul>

      <h2>WhatsApp and Meta</h2>
      <p>
        WhatsApp messaging is provided through Meta&apos;s WhatsApp Business Platform. Message delivery
        and processing are also subject to{' '}
        <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer">
          WhatsApp Business Terms
        </a>{' '}
        and{' '}
        <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer">
          WhatsApp Business Messaging Policy
        </a>
        . Meta may process message metadata and content as described in Meta&apos;s privacy materials.
      </p>

      <h2>Sharing</h2>
      <p>
        We do not sell personal information. We share data only with service providers that help us
        run the portal (for example hosting and database providers) and with Meta when sending or
        receiving WhatsApp messages, or when required by law.
      </p>

      <h2>Retention and security</h2>
      <p>
        We retain information for as long as needed for kitchen operations, customer support, and
        legal obligations. Access is restricted to authorized staff. We use industry-standard
        measures to protect data, but no system is completely secure.
      </p>

      <h2>Your rights</h2>
      <p>
        Customers in the UAE may contact us to request access, correction, or deletion of their
        personal data, subject to legal and operational requirements. Staff should contact their
        administrator for account-related requests.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions, contact Nutrafi Kitchen at{' '}
        <a href="mailto:info@nutrafikitchen.com">info@nutrafikitchen.com</a> or via WhatsApp at{' '}
        +971 50 320 0510.
      </p>

      <p>
        See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalPageShell>
  )
}
