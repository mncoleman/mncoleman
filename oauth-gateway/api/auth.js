const middleWarez = require('../index.js');

module.exports = (req, res) => {
  return middleWarez.auth(req, res);
};
