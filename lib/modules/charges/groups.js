
import Users from 'meteor/vulcan:users';

/*
 Create subscriber group
*/
Users.createGroup("paidMembers");
Users.createGroup("trialMembers");
// Users.groups.paidMembers.can(["pro"]); // mods can edit anybody's posts