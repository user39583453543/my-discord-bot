const { getGuildData } = require('./storage');

// Fires whenever a member's roles (or anything else) change in ANY guild the
// bot is in. If that guild is configured as a rolesync "source" and the
// watched role was just added/removed, mirror it onto the linked target
// server's role.
async function onGuildMemberUpdate(oldMember, newMember) {
  const guild = newMember.guild;
  const data = getGuildData(guild.id);
  const cfg = data.rolesync;
  if (!cfg || !cfg.sourceRoleId || !cfg.targetGuildId) return; // this guild isn't a source

  const hadRole = oldMember.roles.cache.has(cfg.sourceRoleId);
  const hasRole = newMember.roles.cache.has(cfg.sourceRoleId);
  if (hadRole === hasRole) return; // nothing relevant changed

  const targetGuild = newMember.client.guilds.cache.get(cfg.targetGuildId);
  if (!targetGuild) return;
  const targetData = getGuildData(targetGuild.id);
  const targetRoleId = targetData.rolesync?.targetRoleId;
  if (!targetRoleId) return;

  try {
    const targetMember = await targetGuild.members.fetch(newMember.id).catch(() => null);
    if (!targetMember) return;
    if (hasRole && !targetMember.roles.cache.has(targetRoleId)) {
      await targetMember.roles.add(targetRoleId);
    } else if (!hasRole && targetMember.roles.cache.has(targetRoleId)) {
      await targetMember.roles.remove(targetRoleId);
    }
  } catch (err) {
    console.error('[RoleSync] Failed to sync role for', newMember.id, err?.message || err);
  }
}

// If someone leaves the SOURCE (private) server entirely, pull their target
// role in the public server too, so it doesn't stay stuck on forever.
async function onGuildMemberRemove(member) {
  const guild = member.guild;
  const data = getGuildData(guild.id);
  const cfg = data.rolesync;
  if (!cfg || !cfg.sourceRoleId || !cfg.targetGuildId) return;
  if (!member.roles.cache.has(cfg.sourceRoleId)) return;

  const targetGuild = member.client.guilds.cache.get(cfg.targetGuildId);
  if (!targetGuild) return;
  const targetData = getGuildData(targetGuild.id);
  const targetRoleId = targetData.rolesync?.targetRoleId;
  if (!targetRoleId) return;

  try {
    const targetMember = await targetGuild.members.fetch(member.id).catch(() => null);
    if (targetMember && targetMember.roles.cache.has(targetRoleId)) {
      await targetMember.roles.remove(targetRoleId);
    }
  } catch (err) {
    console.error('[RoleSync] Failed to remove role on leave for', member.id, err?.message || err);
  }
}

// If someone JOINS the public (target) server and already holds the private
// role, give them the target role right away instead of waiting for the
// next /rolesync run.
async function onGuildMemberAdd(member) {
  const guild = member.guild;
  const targetData = getGuildData(guild.id);
  const targetRoleId = targetData.rolesync?.targetRoleId;
  if (!targetRoleId) return; // this guild isn't a target

  for (const [, otherGuild] of member.client.guilds.cache) {
    if (otherGuild.id === guild.id) continue;
    const otherData = getGuildData(otherGuild.id);
    const cfg = otherData.rolesync;
    if (!cfg || cfg.targetGuildId !== guild.id || !cfg.sourceRoleId) continue;

    try {
      const sourceMember = await otherGuild.members.fetch(member.id).catch(() => null);
      if (sourceMember && sourceMember.roles.cache.has(cfg.sourceRoleId)) {
        await member.roles.add(targetRoleId);
      }
    } catch (err) {
      console.error('[RoleSync] Failed to sync role on join for', member.id, err?.message || err);
    }
  }
}

module.exports = { onGuildMemberUpdate, onGuildMemberRemove, onGuildMemberAdd };
