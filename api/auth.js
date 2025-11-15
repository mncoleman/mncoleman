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

module.exports = (req, res) => {
  const authorizationUri = oauth2.authorizeURL({
    redirect_uri: process.env.REDIRECT_URL || `${req.protocol}://${req.get('host')}/callback`,
    scope: process.env.SCOPES || 'repo,user',
    state: require('randomstring').generate(32)
  });

  res.redirect(authorizationUri);
};
