import React from "react";
import { Link } from "react-router-dom";

const TermsAndConditionsPage = () => {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">Terms and Conditions</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: March 1, 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-6 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Acceptance of Terms</h2>
            <p>
              By using this service, you agree to these terms. If you do not agree, do not
              use the app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Eligibility</h2>
            <p>
              You must be legally able to use online services in your jurisdiction and provide
              accurate account information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Acceptable Use</h2>
            <p>
              You agree not to misuse the service, including harassment, unlawful activity,
              unauthorized access, or posting harmful content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. User Content</h2>
            <p>
              You retain rights to your content. You grant us a limited license to host and
              process it only to operate and improve the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Service Availability</h2>
            <p>
              We may update, suspend, or discontinue features at any time and do not guarantee
              uninterrupted availability.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Limitation of Liability</h2>
            <p>
              The service is provided as-is. To the maximum extent permitted by law, we are not
              liable for indirect or consequential damages.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Contact</h2>
            <p>
              For legal questions, contact us at:{" "}
              <a
                href="mailto:legal@langvoyage.app"
                className="font-medium text-cyan-700 hover:text-cyan-800"
              >
                legal@langvoyage.app
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

export default TermsAndConditionsPage;
