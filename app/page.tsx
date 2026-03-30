import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>Kaizen Bot is running.</h1>
          <p>
            The backend is healthy and ready to handle Slack agent requests.
          </p>
        </div>
      </main>
    </div>
  );
}
