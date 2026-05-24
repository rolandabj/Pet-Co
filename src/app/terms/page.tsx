export default function TermsPage() {
  return (
    <div className="pt-[120px] pb-20 min-h-screen">
      <div className="max-w-[800px] mx-auto px-6">
        <div className="text-center mb-16 animate-fade-in-up">
          <span className="inline-block px-3.5 py-1 bg-orange-500/10 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-4">Legal</span>
          <h1 className="text-4xl sm:text-5xl font-heading text-[#2C3E50] mb-3">Terms of Service</h1>
          <p className="text-lg text-gray-500">Last updated: January 2025</p>
        </div>

        <div className="animate-fade-in-up prose prose-gray max-w-none" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">1. Acceptance of Terms</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            By accessing or using the Paws &amp; Co. platform (&quot;the Platform&quot;), you agree to be bound by these Terms of Service
            (&quot;Terms&quot;). If you do not agree to all of these Terms, you may not access or use the Platform. These Terms constitute
            a legally binding agreement between you and Paws &amp; Co.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">2. User Roles</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            The Platform facilitates connections between two distinct user groups:
          </p>
          <ul className="list-disc pl-6 text-gray-600 leading-relaxed mb-4 space-y-1">
            <li><strong>Pet Owners</strong> — individuals seeking pet care services for their companion animals.</li>
            <li><strong>Service Providers</strong> — businesses or individuals offering pet care services through the Platform.</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mb-4">
            Each user role carries specific responsibilities. Pet Owners agree to provide accurate information about their pets
            and to treat providers with respect. Service Providers agree to deliver the services they advertise and to maintain
            appropriate licensing, insurance, and certifications as required by law.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">3. Platform Fees</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Paws &amp; Co. charges a <strong>10% platform fee</strong> on all bookings processed through the Platform. This fee is
            calculated as a percentage of the total service price and is disclosed before a booking is confirmed. The platform
            fee covers transaction processing, customer support, and ongoing platform maintenance and improvements.
          </p>
          <p className="text-gray-600 leading-relaxed mb-4">
            Service Providers are responsible for setting their own service rates. The platform fee is deducted from the total
            amount paid by the Pet Owner at the time of booking.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">4. Booking and Cancellation</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Bookings are confirmed once both parties have accepted the service request through the Platform. Pet Owners may
            cancel a booking free of charge up to 24 hours before the scheduled service start time. Cancellations made within
            24 hours of the service may be subject to a cancellation fee determined by the Service Provider.
          </p>
          <p className="text-gray-600 leading-relaxed mb-4">
            Service Providers reserve the right to cancel bookings due to emergencies or unforeseen circumstances. In such
            cases, Pet Owners will receive a full refund of any amounts paid. Paws &amp; Co. encourages providers to give as
            much notice as possible when cancelling.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">5. User Conduct</h2>
          <p className="text-gray-600 leading-relaxed mb-4">You agree not to:</p>
          <ul className="list-disc pl-6 text-gray-600 leading-relaxed mb-4 space-y-1">
            <li>Submit false, misleading, or fraudulent information.</li>
            <li>Harass, abuse, or threaten other users of the Platform.</li>
            <li>Use the Platform to send unsolicited commercial messages (spam).</li>
            <li>Attempt to circumvent the Platform&apos;s booking or payment systems.</li>
            <li>Engage in any activity that could harm the Platform&apos;s infrastructure or other users.</li>
            <li>Create multiple accounts for the purpose of manipulating reviews or ratings.</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mb-4">
            Violation of these rules may result in immediate suspension or termination of your account.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">6. Limitation of Liability</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Paws &amp; Co. acts solely as an intermediary platform connecting Pet Owners with Service Providers. We do not employ,
            supervise, or control any Service Provider. Accordingly:
          </p>
          <ul className="list-disc pl-6 text-gray-600 leading-relaxed mb-4 space-y-1">
            <li>Paws &amp; Co. is not responsible for the quality, safety, or legality of any service provided.</li>
            <li>Paws &amp; Co. is not liable for any injury, loss, or damage resulting from services arranged through the Platform.</li>
            <li>Any disputes between Pet Owners and Service Providers are to be resolved directly between the parties.</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mb-4">
            To the maximum extent permitted by law, Paws &amp; Co. disclaims all warranties, express or implied, regarding the
            Platform and the services offered through it.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">7. Account Termination</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Paws &amp; Co. reserves the right to suspend or terminate accounts that violate these Terms or engage in behaviour
            that we determine, in our sole discretion, to be harmful to the Platform community. Users may delete their
            accounts at any time through their account settings. Account deletion triggers a cascading removal of associated
            data, including bookings, reviews, and provider listings.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">8. Changes to Terms</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            We may update these Terms from time to time. Users will be notified of material changes via email or through the
            Platform. Continued use of the Platform after changes take effect constitutes acceptance of the revised Terms.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">9. Contact</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Questions about these Terms may be directed to our support team through the Contact page or by emailing
            legal@pawsandco.com.
          </p>
        </div>
      </div>
    </div>
  );
}
