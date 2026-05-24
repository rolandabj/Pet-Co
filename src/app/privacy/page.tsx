export default function PrivacyPage() {
  return (
    <div className="pt-[120px] pb-20 min-h-screen">
      <div className="max-w-[800px] mx-auto px-6">
        <div className="text-center mb-16 animate-fade-in-up">
          <span className="inline-block px-3.5 py-1 bg-orange-500/10 rounded-full text-xs font-semibold text-[#E86A33] uppercase tracking-wider mb-4">Legal</span>
          <h1 className="text-4xl sm:text-5xl font-heading text-[#2C3E50] mb-3">Privacy Policy</h1>
          <p className="text-lg text-gray-500">Last updated: January 2025</p>
        </div>

        <div className="animate-fade-in-up prose prose-gray max-w-none" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">1. Information We Collect</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            When you use the Paws &amp; Co. platform, we collect the following categories of information:
          </p>
          <ul className="list-disc pl-6 text-gray-600 leading-relaxed mb-4 space-y-1">
            <li><strong>Account Information:</strong> Name, email address, phone number, and account credentials.</li>
            <li><strong>Profile Information:</strong> Profile photos, location, biography, and service details (for providers).</li>
            <li><strong>Pet Information:</strong> Pet names, species, breed, age, medical needs, and behavioural notes.</li>
            <li><strong>Transaction Data:</strong> Booking history, payment records, and service reviews.</li>
            <li><strong>Usage Data:</strong> Pages visited, features used, and interactions with the Platform.</li>
          </ul>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">2. How We Use Your Information</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            We use the collected information to:
          </p>
          <ul className="list-disc pl-6 text-gray-600 leading-relaxed mb-4 space-y-1">
            <li>Facilitate bookings and payments between Pet Owners and Service Providers.</li>
            <li>Verify provider credentials and maintain platform trust and safety.</li>
            <li>Communicate booking confirmations, reminders, and updates.</li>
            <li>Improve and personalise your experience on the Platform.</li>
            <li>Detect and prevent fraudulent activity or Terms of Service violations.</li>
            <li>Provide customer support and resolve disputes.</li>
          </ul>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">3. Data Sharing</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Your privacy is important to us. We share information only as necessary to provide our services:
          </p>
          <ul className="list-disc pl-6 text-gray-600 leading-relaxed mb-4 space-y-1">
            <li><strong>Between Users:</strong> When a booking is confirmed, the Pet Owner&apos;s name, contact information, and pet details are shared with the Service Provider, and vice versa, to facilitate the service.</li>
            <li><strong>Service Providers:</strong> We share relevant booking and customer information with the Service Provider you&apos;ve booked, so they can deliver the requested care.</li>
            <li><strong>Legal Compliance:</strong> We may disclose information if required by law or to protect the rights, property, or safety of Paws &amp; Co., our users, or others.</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mb-4">
            We do <strong>not</strong> sell your personal information to third parties for marketing purposes.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">4. Cookies and Tracking</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            We use essential cookies and similar tracking technologies to operate the Platform. These include:
          </p>
          <ul className="list-disc pl-6 text-gray-600 leading-relaxed mb-4 space-y-1">
            <li><strong>Authentication Cookies:</strong> To keep you logged in across sessions.</li>
            <li><strong>Session Cookies:</strong> To maintain your session state as you navigate the Platform.</li>
            <li><strong>Functional Cookies:</strong> To remember your preferences and settings.</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mb-4">
            We do not use third-party advertising cookies or cross-site tracking cookies. You may configure your browser
            to block cookies, but this may affect the functionality of the Platform.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">5. Data Security</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            We implement industry-standard security measures to protect your data, including encryption in transit (TLS)
            and at rest, secure authentication via Firebase Auth, and regular security audits. However, no method of
            electronic storage or transmission is 100% secure. We encourage you to use strong, unique passwords and
            to enable two-factor authentication where available.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">6. Data Deletion Rights</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            You have the right to request deletion of your account and associated data at any time. When you delete your
            account through the Platform:
          </p>
          <ul className="list-disc pl-6 text-gray-600 leading-relaxed mb-4 space-y-1">
            <li>Your user profile and credentials are permanently removed.</li>
            <li>All associated pet records are deleted.</li>
            <li>Your bookings and reviews are removed (<strong>cascading delete</strong>).</li>
            <li>If you are a Service Provider, your provider listing and service offerings are removed.</li>
            <li>Payment records may be retained for legal and accounting purposes as required by applicable law.</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mb-4">
            You may also request data access or correction by contacting our support team. We will respond to all
            legitimate requests within 30 days.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">7. Children&apos;s Privacy</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            The Platform is not intended for use by individuals under the age of 18. We do not knowingly collect
            personal information from minors. If you believe a minor has provided us with personal data, please
            contact us so we can take appropriate action.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">8. Changes to This Policy</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            We may update this Privacy Policy from time to time. Material changes will be communicated via email or
            through a prominent notice on the Platform. We encourage you to review this policy periodically.
          </p>

          <h2 className="text-2xl font-heading text-[#2C3E50] mt-10 mb-4">9. Contact</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            For questions about this Privacy Policy or to exercise your data rights, please contact us through the
            Contact page or email privacy@pawsandco.com.
          </p>
        </div>
      </div>
    </div>
  );
}
