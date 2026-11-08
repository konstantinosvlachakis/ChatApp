import React from "react";
import LegalBackLink from "../components/Auth/LegalBackLink";

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-[100dvh] bg-slate-100 px-3 py-6 sm:px-4 sm:py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: November 8, 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-6 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Information We Collect</h2>
            <p>
              We may collect information you provide directly, including account details,
              profile information, and messages you send through the app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. How We Use Information</h2>
            <p>
              We use your information to operate, maintain, and improve the service,
              authenticate your account, and provide communication features.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Data Storage</h2>
            <p>
              Account and application data may be stored in third-party cloud services,
              including authentication and database providers, to deliver core product
              functionality.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Data Sharing</h2>
            <p>
              We do not sell personal information. We may share data with service providers
              that help operate the app and as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Sign in with Google</h2>
            <p>
              If you choose to continue with Google, Google shares your name, email address and
              a unique account identifier with us so we can create or sign in to your account. We
              don&apos;t receive your Google password or access to other Google services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Analytics Cookies</h2>
            <p>
              With your consent, we use Google Analytics to understand how LangVoyage is used, for
              example which pages are visited and whether sign-up or a guided exchange was completed.
              Analytics cookies are only set after you accept them. We don&apos;t send message
              content, usernames, email addresses or chat identifiers to Google Analytics, and we
              don&apos;t use it for advertising. You can change your choice at any time through
              &quot;Cookie choices&quot; at the bottom of the page or in Settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Security</h2>
            <p>
              We implement reasonable safeguards, but no method of transmission or storage
              is completely secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">8. Your Choices</h2>
            <p>
              You can update profile information in-app, delete your account in Settings,
              and accept or decline analytics cookies at any time. You may also request account
              deletion by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">9. Contact</h2>
            <p>
              For privacy questions, contact us at:{" "}
              <a
                href="mailto:privacy@langvoyage.app"
                className="font-medium text-cyan-700 hover:text-cyan-800"
              >
                privacy@langvoyage.app
              </a>
            </p>
          </section>
        </div>

        <div className="mt-8 text-sm">
          <LegalBackLink />
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
