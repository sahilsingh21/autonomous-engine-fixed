const express = require('express')
const router = express.Router()

router.get('/approve/:token', async (req, res) => {
  const { token } = req.params

  console.log('✅ APPROVED:', token)

  // TODO:
  // update DB status approved=true
  // trigger actual publishing here

  return res.send(`
    <html>
      <body style="
        font-family:sans-serif;
        background:#0b1020;
        color:white;
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
      ">
        <div style="text-align:center">
          <h1>✅ Post Approved</h1>
          <p>Toolify AI will publish the content now.</p>
        </div>
      </body>
    </html>
  `)
})

router.get('/reject/:token', async (req, res) => {
  const { token } = req.params

  console.log('❌ REJECTED:', token)

  return res.send(`
    <html>
      <body style="
        font-family:sans-serif;
        background:#0b1020;
        color:white;
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
      ">
        <div style="text-align:center">
          <h1>❌ Post Rejected</h1>
          <p>The content will not be published.</p>
        </div>
      </body>
    </html>
  `)
})

module.exports = router