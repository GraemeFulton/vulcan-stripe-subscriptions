Package.describe({
  name: 'vulcan:stripe-subscriptions',
  summary: 'Stripe payments package for Vulcan',
  version: '0.0.1',
  git: 'https://github.com/VulcanJS/Vulcan.git',
});

Package.onUse(function (api) {
  api.versionsFrom('1.6.1');

  api.use(['promise', 'vulcan:core', 'fourseven:scss']);

  api.mainModule('lib/server/main.js', 'server');
  api.mainModule('lib/client/main.js', 'client');

  api.addFiles(['lib/stylesheets/style.scss']);
});
