const simpleOauthModule = require('simple-oauth2');

const config = {
  client: {
    id: process.env.OAUTH_CLIENT_ID,
    secret: process.env.OAUTH_CLIENT_SECRET
  },
  auth: {
    tokenHost: process.env.GIT_HOSTNAME || 'https://github.com',
    tokenPath: process.env.OAUTH_TOKEN_PATH || '/login/oauth/access_token',
    authorizePath: process.env.OAUTH_AUTHORIZE_PATH || '/login/oauth/authorize'
  }
};

const oauth2 = new simpleOauthModule.AuthorizationCode(config);

function generateScript(provider, status, content) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Authorizing...</title>
    </head>
    <body>
      <script>
      (function() {
        function receiveMessage(e) {
          console.log("receiveMessage %o", e)
          window.opener.postMessage(
            'authorization:${provider}:${status}:${JSON.stringify(content)}',
            e.origin
          )
          window.removeEventListener("message",receiveMessage,false);
        }
        window.addEventListener("message", receiveMessage, false)
        console.log("Sending message: %o", "github")
        window.opener.postMessage("authorizing:${provider}", "*")
      })()
      </script>
    </body>
    </html>
  `;
}

module.exports = async (req, res) => {
  const code = req.query.code;
  const provider = process.env.OAUTH_PROVIDER || 'github';

  try {
    const result = await oauth2.getToken({ code });

    // In simple-oauth2 v5, the token is directly in result.token
    const accessToken = result.token.access_token;

    const content = {
      token: accessToken,
      provider: provider
    };

    console.log('Token obtained successfully');
    const script = generateScript(provider, 'success', content);
    res.send(script);
  } catch (error) {
    console.error('Access Token Error', error);
    const script = generateScript(provider, 'error', JSON.stringify(error));
    res.send(script);
  }
};
