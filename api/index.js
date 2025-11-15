module.exports = (req, res) => {
  const loginAuthTarget = process.env.AUTH_TARGET || '_self';
  const oauthProvider = process.env.OAUTH_PROVIDER || 'github';

  res.send(`Hello<br>
    <a href="/auth" target="${loginAuthTarget}">
      Log in with ${oauthProvider.toUpperCase()}
    </a>`);
};
