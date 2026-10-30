"use server";

import { revalidatePath } from "next/cache";

import { createGroup, deleteGroup, renameGroup } from "@/lib/contacts";
import {
  GROUP_TAKEN_MESSAGE,
  groupNameSchema,
  type AddGroupResult,
  type GroupFormState,
} from "@/lib/group-form";

function assertId(id: number, what: string) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`Invalid ${what} id: ${id}`);
  }
}

function readName(formData: FormData) {
  const raw = formData.get("name");
  return typeof raw === "string" ? raw : "";
}

// Called by the "Добавить" button in the contact form. A name that already
// exists (any case) gives the existing group back
export async function addGroupAction(name: string): Promise<AddGroupResult> {
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const group = await createGroup(parsed.data);

  revalidatePath("/", "layout");
  return { ok: true, group };
}

// The "Новая группа" form on the "Группы" page
export async function createGroupFormAction(
  _prevState: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const value = readName(formData);
  const result = await addGroupAction(value);
  if (!result.ok) {
    return { status: "error", error: result.error, value };
  }
  return { status: "saved", savedAt: new Date().toISOString() };
}

export async function renameGroupAction(
  id: number,
  _prevState: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  assertId(id, "group");

  const value = readName(formData);
  const parsed = groupNameSchema.safeParse(value);
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0].message, value };
  }

  const result = await renameGroup(id, parsed.data);
  if (result === "taken") {
    return { status: "error", error: GROUP_TAKEN_MESSAGE, value };
  }
  if (result === "not-found") {
    return { status: "error", error: "Эта группа не найдена", value };
  }

  revalidatePath("/", "layout");
  return { status: "saved", savedAt: new Date().toISOString() };
}

export async function deleteGroupAction(id: number) {
  assertId(id, "group");

  // A group already deleted elsewhere ends the same way: it is gone
  await deleteGroup(id);

  revalidatePath("/", "layout");
}
