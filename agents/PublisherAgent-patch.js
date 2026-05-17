// PATCH: add this to the top of publishAll() in PublisherAgent.js
// after: this.orchestrator.broadcast({ type:'task', message:... level:'info' })
// Before posting to each platform, check if it's enabled:

/*
  const { loadState } = require('../routes/platforms')
  const platformState = loadState()

  // LinkedIn
  if (content.linkedin && this.canPost('linkedin') && platformState.linkedin) {
    ...
  }

  // Twitter
  if (content.twitter && this.canPost('twitter') && platformState.twitter) {
    ...
  }

  // Reddit
  if (content.reddit && this.canPost('reddit') && platformState.reddit) {
    ...
  }
*/
