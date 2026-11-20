import { InfoLayout } from '../components/InfoLayout';

export function PrivacyPage() {
  return (
    <InfoLayout title="Privacy policy">
      <section className="content-page">
        <p className="eyebrow">Legal</p>
        <h1>Privacy policy</h1>
        <div className="prose-block">
          <p>
            We use your sign-in details (email / Google account) only to
            authenticate you and associate your portfolio, settings, and alerts
            with your account.
          </p>
          <p>
            Holdings, loans, and notification preferences you enter are stored
            so the app can show your net worth and deliver optional email or
            Telegram alerts.
          </p>
          <p>
            We do not sell your personal data. You can sign out at any time. For
            privacy questions, email{' '}
            <a className="accent-link" href="mailto:info@sknics.com">
              info@sknics.com
            </a>
            .
          </p>
        </div>
      </section>
    </InfoLayout>
  );
}
