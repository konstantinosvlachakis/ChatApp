import React from "react";
import { Link } from "react-router-dom";

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-[100dvh] bg-slate-100 px-3 py-6 sm:px-4 sm:py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: March 1, 2026</p>

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
            <h2 className="text-lg font-semibold text-slate-900">5. Security</h2>
            <p>
              We implement reasonable safeguards, but no method of transmission or storage
              is completely secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Your Choices</h2>
            <p>
              You can update profile information in-app. You may also request account
              deletion by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Contact</h2>
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
          <Link to="/login" className="font-semibold text-cyan-700 hover:text-cyan-800">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
