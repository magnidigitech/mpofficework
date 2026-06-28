import { prisma } from "@/lib/prisma";

export async function createChecklistForSchedule(scheduleId: string, userId: string, tx: any) {
  // 1. Check if VisitChecklist already exists
  const existingChecklist = await tx.visitChecklist.findUnique({
    where: { scheduleId },
  });

  if (existingChecklist) {
    return existingChecklist;
  }

  // 2. Fetch the schedule to inspect category
  const schedule = await tx.schedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  // 3. Find matching template
  let template = null;
  if (schedule.category) {
    template = await tx.checklistTemplate.findFirst({
      where: {
        eventCategory: {
          equals: schedule.category,
          mode: "insensitive",
        },
        isActive: true,
      },
      include: { items: true },
    });
  }

  // If no category matching template found, fetch the default template
  if (!template) {
    template = await tx.checklistTemplate.findFirst({
      where: { isDefault: true, isActive: true },
      include: { items: true },
    });
  }

  if (!template) {
    // If no template is configured, create empty checklist
    return await tx.visitChecklist.create({
      data: {
        scheduleId,
        status: "NOT_STARTED",
        totalItems: 0,
        completedItems: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  // 4. Create VisitChecklist record
  const checklist = await tx.visitChecklist.create({
    data: {
      scheduleId,
      templateId: template.id,
      status: "NOT_STARTED",
      totalItems: template.items.length,
      completedItems: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // 5. Copy template items into VisitChecklistItem records (idempotent snapshot copying)
  if (template.items.length > 0) {
    await tx.visitChecklistItem.createMany({
      data: template.items.map((item: any) => ({
        visitChecklistId: checklist.id,
        templateItemId: item.id,
        title: item.title,
        description: item.description,
        section: item.section,
        displayOrder: item.displayOrder,
        isMandatory: item.isMandatory,
        isCompleted: false,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    });
  }

  // Log Activity for checklist generation
  // We can write log inside transaction
  await tx.activityLog.create({
    data: {
      userId,
      action: "CREATE_CHECKLIST",
      details: `Generated visit checklist for schedule "${schedule.title}" using template "${template.name}"`,
      createdAt: new Date(),
    },
  });

  return checklist;
}
