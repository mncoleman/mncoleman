const simpleOauthModule = require('simple-oauth2');
const randomstring = require('randomstring');

module.exports = async (req, res) => {
  try {
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

    // Get the host from headers (works in Vercel)
    const host = req.headers.host || 'matthew-coleman.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] || 'https';

    const authorizationUri = oauth2.authorizeURL({
      redirect_uri: process.env.REDIRECT_URL || `${protocol}://${host}/callback`,
      scope: process.env.SCOPES || 'repo,user',
      state: randomstring.generate(32)
    });

    res.redirect(authorizationUri);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
};
