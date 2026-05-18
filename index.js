/**
 * index.js — Bulk Email Sender
 * Reads recipients from a file and sends via Gmail / Nodemailer.
 *
 * Usage:
 *   node index.js                     # uses settings in .env
 *   node index.js emails.csv          # override the emails file
 */

'use strict';

require('dotenv').config();

const nodemailer   = require('nodemailer');
const fs           = require('fs');
const path         = require('path');
const chalk        = require('chalk');
const cliProgress  = require('cli-progress');
const { loadEmails } = require('./emailParser');

// ── config ────────────────────────────────────────────────────────────────────

const CONFIG = {
  senderEmail   : process.env.SENDER_EMAIL        || 'adhuldivyan363@gmail.com',
  appPassword   : process.env.SENDER_APP_PASSWORD || '',
  subject       : process.env.EMAIL_SUBJECT       || 'Hello from Adhul!',
  bodyText      : process.env.EMAIL_BODY_TEXT      || 'Hi there! This is a message from Adhul Divyan.',
  emailsFile    : process.argv[2] || process.env.EMAILS_FILE || 'emails.txt',
  delayMs       : parseInt(process.env.DELAY_MS   || '1500', 10),
  maxEmails     : parseInt(process.env.MAX_EMAILS  || '0',    10),
  templateFile  : path.join(__dirname, 'template.html'),
  logFile       : path.join(__dirname, 'send_log.json'),
};

// ── helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadHtmlTemplate() {
  if (fs.existsSync(CONFIG.templateFile)) {
    return fs.readFileSync(CONFIG.templateFile, 'utf8');
  }
  // Inline fallback if template.html is missing
  return `<p>${CONFIG.bodyText}</p>`;
}

function loadLog() {
  if (fs.existsSync(CONFIG.logFile)) {
    try { return JSON.parse(fs.readFileSync(CONFIG.logFile, 'utf8')); }
    catch { /* corrupt log — start fresh */ }
  }
  return { sent: [], failed: [] };
}

function saveLog(log) {
  fs.writeFileSync(CONFIG.logFile, JSON.stringify(log, null, 2), 'utf8');
}

function validateConfig() {
  const errs = [];
  if (!CONFIG.senderEmail)  errs.push('SENDER_EMAIL is not set');
  if (!CONFIG.appPassword || CONFIG.appPassword === 'your_16_char_app_password_here') {
    errs.push(
      'SENDER_APP_PASSWORD is not set.\n' +
      '  → Go to https://myaccount.google.com/security\n' +
      '  → Enable 2-Step Verification\n' +
      '  → Search "App Passwords" and create one for "Mail"\n' +
      '  → Paste the 16-character code into .env'
    );
  }
  return errs;
}

// ── transporter ───────────────────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: CONFIG.senderEmail,
      pass: CONFIG.appPassword,
    },
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.bold.blue('\n📧  Bulk Email Sender  —  Adhul Divyan\n'));

  // 1. Validate config
  const configErrors = validateConfig();
  if (configErrors.length) {
    console.error(chalk.red('❌  Configuration errors:\n'));
    configErrors.forEach(e => console.error(chalk.red(`  • ${e}\n`)));
    process.exit(1);
  }

  // 2. Load email addresses
  let emails;
  try {
    emails = loadEmails(CONFIG.emailsFile);
  } catch (err) {
    console.error(chalk.red(`❌  Could not load emails file: ${err.message}`));
    process.exit(1);
  }

  if (emails.length === 0) {
    console.error(chalk.yellow('⚠️  No valid email addresses found in the file.'));
    process.exit(0);
  }

  // Apply max cap
  const limit = CONFIG.maxEmails > 0 ? CONFIG.maxEmails : emails.length;
  const batch = emails.slice(0, limit);

  // 3. Load previous log to skip already-sent addresses
  const log = loadLog();
  const alreadySent = new Set(log.sent.map(e => e.toLowerCase()));
  const toSend = batch.filter(e => !alreadySent.has(e.toLowerCase()));

  console.log(chalk.cyan(`📂  Emails file   : ${CONFIG.emailsFile}`));
  console.log(chalk.cyan(`📬  Total found   : ${emails.length}`));
  console.log(chalk.cyan(`✅  Already sent  : ${alreadySent.size}`));
  console.log(chalk.cyan(`🚀  Will send now : ${toSend.length}`));
  console.log(chalk.cyan(`⏱   Delay/email   : ${CONFIG.delayMs} ms\n`));

  if (toSend.length === 0) {
    console.log(chalk.green('✅  All emails already sent. Nothing to do.'));
    return;
  }

  // 4. Verify SMTP connection
  const transporter = createTransporter();
  try {
    await transporter.verify();
    console.log(chalk.green('✅  Gmail connection verified\n'));
  } catch (err) {
    console.error(chalk.red(`❌  SMTP connection failed: ${err.message}`));
    console.error(chalk.yellow('   Make sure your App Password is correct and 2FA is enabled on Gmail.'));
    process.exit(1);
  }

  // 5. Load HTML template
  const htmlBody = loadHtmlTemplate();

  // 6. Progress bar
  const bar = new cliProgress.SingleBar({
    format: chalk.cyan('{bar}') + ' {percentage}% | {value}/{total} | ✅ {sent} 🔴 {failed}',
    barCompleteChar : '█',
    barIncompleteChar: '░',
    hideCursor: true,
  });
  bar.start(toSend.length, 0, { sent: 0, failed: 0 });

  let sentCount   = 0;
  let failedCount = 0;

  // 7. Send loop
  for (const email of toSend) {
    try {
      await transporter.sendMail({
        from    : `"Adhul Divyan" <${CONFIG.senderEmail}>`,
        to      : email,
        subject : CONFIG.subject,
        text    : CONFIG.bodyText,
        html    : htmlBody,
      });

      log.sent.push(email);
      sentCount++;
    } catch (err) {
      log.failed.push({ email, error: err.message, time: new Date().toISOString() });
      failedCount++;
    }

    // Save after every email so progress survives a crash
    saveLog(log);
    bar.increment(1, { sent: sentCount, failed: failedCount });
    await sleep(CONFIG.delayMs);
  }

  bar.stop();

  // 8. Summary
  console.log('\n' + chalk.bold('─'.repeat(50)));
  console.log(chalk.green(`✅  Sent    : ${sentCount}`));
  if (failedCount > 0) {
    console.log(chalk.red(`❌  Failed  : ${failedCount}`));
    console.log(chalk.yellow(`   See ${CONFIG.logFile} for details.`));
  }
  console.log(chalk.bold('─'.repeat(50)) + '\n');
}

main().catch(err => {
  console.error(chalk.red('\n💥  Unexpected error:'), err);
  process.exit(1);
});
