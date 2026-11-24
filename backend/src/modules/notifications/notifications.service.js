const prisma = require('../../config/prisma');
const { getAccessibleClassIds } = require('../../utils/access');

const create = async (data, user) => {
  const { title, content, receiver_ids } = data;
  if (!title || !String(title).trim() || !content || !String(content).trim()) {
    throw { statusCode: 400, message: 'Tiêu đề và nội dung thông báo không được để trống' };
  }
  if (!Array.isArray(receiver_ids) || receiver_ids.length === 0) {
    throw { statusCode: 400, message: 'Thông báo phải có ít nhất một người nhận' };
  }

  const recipientIds = [...new Set(receiver_ids.map(Number))];
  if (recipientIds.some((id) => !Number.isInteger(id))) {
    throw { statusCode: 400, message: 'Danh sách người nhận không hợp lệ' };
  }

  const allowedRecipients = await getRecipients(user);
  const allowedIds = new Set([
    ...allowedRecipients.students.map((student) => student.user_id),
    ...allowedRecipients.parents.map((parent) => parent.user_id),
  ]);
  const forbiddenIds = recipientIds.filter((id) => !allowedIds.has(id));
  if (forbiddenIds.length > 0) {
    throw { statusCode: 403, message: 'Danh sách người nhận chứa tài khoản ngoài phạm vi phụ trách' };
  }

  return prisma.$transaction(async (tx) => {
    const notification = await tx.notification.create({
      data: { title: String(title).trim(), content: String(content).trim(), created_by: Number(user.userId) },
    });

    await tx.notificationReceiver.createMany({
      data: recipientIds.map((uid) => ({
        notification_id: notification.notification_id,
        user_id: uid,
        is_read: false,
      })),
      skipDuplicates: true,
    });

    return tx.notification.findUnique({
      where: { notification_id: notification.notification_id },
      include: { creator: { select: { full_name: true } }, _count: { select: { receivers: true } } },
    });
  });
};

const getForUser = async (userId) => {
  return prisma.notificationReceiver.findMany({
    where: { user_id: Number(userId) },
    include: { notification: { include: { creator: { select: { full_name: true } } } } },
    orderBy: { notification: { created_at: 'desc' } },
  });
};

const markRead = async (notifId, userId) => {
  return prisma.notificationReceiver.updateMany({
    where: { notification_id: Number(notifId), user_id: Number(userId) },
    data: { is_read: true },
  });
};

const markAllRead = async (userId) => {
  return prisma.notificationReceiver.updateMany({
    where: { user_id: Number(userId), is_read: false },
    data: { is_read: true },
  });
};

const getUnreadCount = async (userId) => {
  return prisma.notificationReceiver.count({
    where: { user_id: Number(userId), is_read: false },
  });
};

const getSentNotifications = async (createdBy) => {
  return prisma.notification.findMany({
    where: { created_by: Number(createdBy) },
    include: {
      creator: { select: { full_name: true } },
      _count: { select: { receivers: true } },
    },
    orderBy: { created_at: 'desc' },
  });
};

/**
 * Lấy danh sách tất cả người có thể nhận thông báo từ giáo viên:
 *  - Học sinh của các lớp GV phụ trách (hoặc chủ nhiệm)
 *  - Phụ huynh của các học sinh đó
 */
const getRecipients = async (user) => {
  const accessibleClassIds = await getAccessibleClassIds(user);
  if (Array.isArray(accessibleClassIds) && accessibleClassIds.length === 0) {
    return { students: [], parents: [] };
  }

  // Lấy học sinh từ các lớp đó
  const students = await prisma.student.findMany({
    where: accessibleClassIds === null
      ? {}
      : { class_instance_id: { in: accessibleClassIds } },
    select: {
      student_id: true,
      student_code: true,
      user: { select: { user_id: true, full_name: true, username: true } },
      class_instance: {
        select: {
          grade: true,
          class: { select: { class_code: true } },
        },
      },
    },
    orderBy: { user: { full_name: 'asc' } },
  });

  // Lấy phụ huynh của các học sinh đó
  const studentIds = students.map(s => s.student_id);
  const parentLinks = await prisma.studentParent.findMany({
    where: { student_id: { in: studentIds } },
    select: {
      student: {
        select: {
          user: { select: { full_name: true } },
          class_instance: {
            select: { grade: true, class: { select: { class_code: true } } },
          },
        },
      },
      parent: {
        select: {
          parent_id: true,
          user: { select: { user_id: true, full_name: true, username: true } },
        },
      },
    },
  });

  // Deduplicate parents
  const parentMap = new Map();
  for (const link of parentLinks) {
    const pid = link.parent.parent_id;
    if (!parentMap.has(pid)) {
      parentMap.set(pid, {
        ...link.parent,
        children: [],
      });
    }
    parentMap.get(pid).children.push({
      name: link.student.user.full_name,
      class: `${link.student.class_instance?.grade}${link.student.class_instance?.class?.class_code}`,
    });
  }

  return {
    students: students.map(s => ({
      user_id: s.user.user_id,
      full_name: s.user.full_name,
      username: s.user.username,
      student_code: s.student_code,
      class: `${s.class_instance?.grade}${s.class_instance?.class?.class_code}`,
    })),
    parents: Array.from(parentMap.values()).map(p => ({
      user_id: p.user.user_id,
      full_name: p.user.full_name,
      username: p.user.username,
      children: p.children,
    })),
  };
};

module.exports = { create, getForUser, markRead, markAllRead, getUnreadCount, getSentNotifications, getRecipients };

