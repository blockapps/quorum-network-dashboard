const bcrypt = require('bcrypt');
const moment = require('moment');

const jwtConfig = require('../config/app.config');
const jwtHandler = require('../middlewares/jwt-handler.js');
const models = require('../models');
const responseWrapper = require('../utils/response-wrapper');


module.exports = {
  // TODO: rewrite controllers according to Network Dashboard requirements




  // Login can be executed by logged-in users and re-logins with new credentials provided
  login: function (req, res, next) {
    const email = req.body.email;
    const password = req.body.password;

    // Check if password provided for the user is correct
    models.User.findOne({
      where: {email: email},
      include: [{
        model: models.Role,
      }]
    }).then(user => {
      const authErrorText = "user does not exist or wrong user-password pair provided";
      if (!user) {
        let err = new Error(authErrorText);
        err.status = 401;
        return next(err);
      } else {
        bcrypt.compare(password, user['passwordHash'], function (err, passIsCorrect) {
          if (err) {
            return next(err);
          } else {
            if (!passIsCorrect) {
              let err = new Error(authErrorText);
              err.status = 401;
              return next(err);
            } else {
              let tokenData;
              try {
                tokenData = jwtHandler.issue(user);
              }
              catch(err) {
                return next(err);
              }

              res.cookie(
                jwtConfig.authCookieName,
                tokenData.token,
                {
                  domain: jwtConfig.authCookieDomain,
                  httpOnly: true,
                  secure: jwtConfig.authCookieSecure,
                  expire: moment(tokenData.expireDate).toDate()
                }
              );
              res.status(200).json({
                user: {
                  id: user['id'],
                  email: user['email'],
                  roles: user['Roles'].map(role => role.name),
                }
              });
            }
          }
        });
      }
    });
  },

  getCurrentUser: function (req, res) {
    models.User.findById(req.user.id).then(user => {
      if (!user) {
        res.status(500).send(responseWrapper('', false, true));
      } else {
        const userResponse = {
          id: user["id"],
          username: user["username"],
        };
        res.status(200).send(responseWrapper(userResponse, true));
      }
    })
  },

  createUser: function (req, res) {
    const username = req.body.username;
    const password = req.body.password;
    if (!username || !password) {
      res.status(400).send(responseWrapper("wrong params, expected: {username, password}"), false);
      return;
    }
    // TODO: validate username and password to meet some requirements

    // Check if user exists
    models.User.findOne({where: {username: username}}).then(user => {
      if (user) {
        res.status(409).send(responseWrapper("user already exists", false));
      } else {
        bcrypt.hash(password, 10, function (err, hash) {
          if (err) {
            res.status(500).send(responseWrapper('', false, true));
          } else {
            models.User.create({
              username: username,
              password_hash: hash
            }).then(function () {
              res.status(200).send(responseWrapper("user created", true));
            });
          }
        });
      }
    })
  },

  editUser: function (req, res) {
    //TODO: update regarding the actual user model
    const changeableParams = ['newPassword', 'oldPassword'];
    const newPassword = req.body['newPassword'];
    const oldPassword = req.body['oldPassword'];

    const requestParamsSetValid = Object.keys(req.body).every(item => changeableParams.includes(item));
    if (!requestParamsSetValid) {
      res.status(400).send(responseWrapper(`wrong params, possible options: [${changeableParams.toString()}]`, false));
      return;
    }

    // TODO: implement full model PATCH instead
    // TODO: rewrite using bcrypt promises
    if (!(newPassword && oldPassword)) {
      res.status(400).send(responseWrapper(`expected both params: [password, oldPassword]`, false));
    } else {
      models.User.findById(req.user.id).then(user => {
        if (!user) {
          res.status(500).send(responseWrapper('', false, true));
        } else {
          bcrypt.compare(oldPassword, user['password_hash'], function (err, passIsCorrect) {
            if (err) {
              res.status(500).send(responseWrapper('', false, true))
            } else {
              if (!passIsCorrect) {
                res.status(401).send(responseWrapper('old password is incorrect', false));
              } else {
                bcrypt.hash(newPassword, 10, function (err, hash) {
                  if (err) {
                    res.status(500).send(responseWrapper('', false, true));
                  } else {
                    user.update({password_hash: hash}, {fields: ['password_hash']}).then(
                      () => {
                        res.status(200).send(responseWrapper('password changed', false))
                      }
                    ).catch(errors => {
                      console.error(errors);
                      res.status(500).send(responseWrapper('', false, true));
                    })
                  }
                })
              }
            }
          })
        }
      })
      .catch(errors => {
        console.error(errors);
        res.status(500).send(responseWrapper('', false, true));
      });
    }
  },

  logout: function (req, res) {
    res.clearCookie(jwtConfig.authCookieName);
    res.status(200).json({
      message: 'Logout successful'
    });
  },

};