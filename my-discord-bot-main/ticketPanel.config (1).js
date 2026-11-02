// Settings for the /ticket-panel design. Edit this file, restart the bot, then run /ticket-panel again.

module.exports = {
  accentColor: 0xff6a1a,

  // `category` MUST match the category names you already use, because
  // the bot picks each ticket's questions (/ticket-questions) by this name.
  categories: {
    support: {
      category: 'Support',
      image: 'header-support.png',
      text: 'Need help or have a general question? Open a support ticket.',
      hint: 'Be as detailed as possible so we can help quickly.',
      button: { label: 'Get Help', emoji: '🛠️', style: 'Primary' },
      // Pop-up form. Discord limits: title and question max 45 characters, max 5 questions.
      formTitle: '🛠️ RISE Support',
      questions: [
        { label: '📌 What do you need help with?', placeholder: 'e.g. VIP issue, report a player, ban appeal, question…', paragraph: false },
        { label: '📝 Explain in as much detail as you can', placeholder: 'What happened, when it happened, and anything you already tried', paragraph: true },
        { label: '🎮 Your in-game name or Steam ID', placeholder: 'So we can find you, e.g. 76561198000000000', paragraph: false },
      ],
    },
    partner: {
      category: 'Advertisement Enquiries',
      image: 'header-partner.png',
      text: 'Interested in advertising or partnering with RISE?',
      hint: 'Include details about your offer or proposal.',
      button: { label: 'Enquire Now', emoji: '🤝', style: 'Secondary' },
      formTitle: '🤝 Partnership Enquiry',
      questions: [
        { label: '🏷️ Who are you / who do you represent?', placeholder: 'Your name, brand, server, team or channel', paragraph: false },
        { label: '💼 What are you offering?', placeholder: 'Advertising, sponsorship, collab, partnership… give us the details', paragraph: true },
        { label: '📈 Audience size & links', placeholder: 'e.g. 25k YouTube subs, youtube.com/@yourchannel', paragraph: false },
        { label: '🎯 What would you want from RISE?', placeholder: 'What you expect in return', paragraph: true },
      ],
    },
    join: {
      category: 'Join RISE',
      image: 'header-join.png',
      text: 'Apply to join the RISE team. Make sure you meet every requirement first.',
      requirementsImage: 'requirements.png',
      button: { label: 'Apply Now', emoji: '🔥', style: 'Success' },
      formTitle: '🔥 Apply to RISE',
      // Keep "how many hours do you have on rust" and "hours/day" in these labels:
      // the bot reads those answers to mark strong applicants as high priority.
      questions: [
        { label: '⏳ How many hours do you have on Rust?', placeholder: 'e.g. 5000 hours', paragraph: false },
        { label: '🆔 Steam ID + teams you have played in', placeholder: 'e.g. 76561198000000000 · Team A, Team B', paragraph: false },
        { label: '📊 Your BattleMetrics profile link', placeholder: 'https://www.battlemetrics.com/players/...', paragraph: false },
        { label: '🛠️ What can you do? (roles/skills)', placeholder: 'e.g. PVP, Builder, Farmer, Caller, Support…', paragraph: false },
        { label: '⏰ Hours/day you can play? Can you buy VIP?', placeholder: '10+ hours a day required · e.g. 12 hours · Yes / No for VIP', paragraph: false },
      ],
    },
  },

  checklist: [
    'Check **Quick Answers** at the bottom',
    'One ticket per issue',
    "No need to ping staff. We'll get to you",
  ],

  footer: '⏱️ We usually reply within 24h · RISE Team',

  // Quick Answers dropdown (max 25). Members see the answer privately.
  // `answer: 'WIPE'` is filled in live from your /wipeconfig schedule.
  // Everything else below is a PLACEHOLDER: replace with your real answers.
  faq: [
    { value: 'wipe',   emoji: '🗓️', label: 'When is the next wipe?',          answer: 'WIPE' },
    { value: 'apply',  emoji: '🔥', label: 'How long do applications take?',   answer: "**🔥 Applications**\nWe review applications within a few days. Please don't open extra tickets to ask." },
    { value: 'other',  emoji: '💬', label: 'Something else',                   answer: '**💬 Still stuck?**\nClick **Get Help** above and the team will sort you out.' },
  ],
};
