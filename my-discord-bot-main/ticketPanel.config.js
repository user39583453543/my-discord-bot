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
    },
    partner: {
      category: 'Advertisement Enquiries',
      image: 'header-partner.png',
      text: 'Interested in advertising or partnering with RISE?',
      hint: 'Include details about your offer or proposal.',
      button: { label: 'Enquire Now', emoji: '🤝', style: 'Secondary' },
    },
    join: {
      category: 'Join RISE',
      image: 'header-join.png',
      text: 'Apply to join the RISE team. Make sure you meet every requirement first.',
      requirementsImage: 'requirements.png',
      button: { label: 'Apply Now', emoji: '🔥', style: 'Success' },
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
    { value: 'vip',    emoji: '💎', label: 'How do I buy VIP?',                answer: '**💎 VIP**\nYou can buy VIP at <your store link>.' },
    { value: 'apply',  emoji: '🔥', label: 'How long do applications take?',   answer: "**🔥 Applications**\nWe review applications within a few days. Please don't open extra tickets to ask." },
    { value: 'report', emoji: '🚨', label: 'How do I report a player?',        answer: '**🚨 Reports**\nOpen a **Support** ticket with their name, the time, and any clips or screenshots.' },
    { value: 'other',  emoji: '💬', label: 'Something else',                   answer: '**💬 Still stuck?**\nClick **Get Help** above and the team will sort you out.' },
  ],
};
