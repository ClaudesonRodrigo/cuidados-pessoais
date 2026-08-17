export type ProfileSchedule = {
  open: string;
  close: string;
  lunchStart?: string;
  lunchEnd?: string;
  workingDays: number[];
};

export type LunchIntervalState = {
  enabled: boolean;
  lunchStart: string;
  lunchEnd: string;
};

type ProfileScheduleDraft = {
  open: string;
  close: string;
  workingDays: number[];
  lunchEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
};

export type ProfileScheduleResult =
  | { ok: true; schedule: ProfileSchedule }
  | { ok: false; message: string };

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const minutes = (value: string): number | null => {
  if (!TIME_PATTERN.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

export const readLunchInterval = (
  schedule?: Partial<ProfileSchedule>,
): LunchIntervalState => ({
  enabled: Boolean(schedule?.lunchStart && schedule?.lunchEnd),
  lunchStart: schedule?.lunchStart || "",
  lunchEnd: schedule?.lunchEnd || "",
});

export const buildProfileSchedule = (
  draft: ProfileScheduleDraft,
): ProfileScheduleResult => {
  const schedule: ProfileSchedule = {
    open: draft.open,
    close: draft.close,
    workingDays: [...draft.workingDays],
  };
  if (!draft.lunchEnabled) return { ok: true, schedule };

  if (!draft.lunchStart || !draft.lunchEnd) {
    return { ok: false, message: "Preencha o início e o fim do intervalo." };
  }

  const open = minutes(draft.open);
  const close = minutes(draft.close);
  const lunchStart = minutes(draft.lunchStart);
  const lunchEnd = minutes(draft.lunchEnd);
  if (open === null || close === null || lunchStart === null || lunchEnd === null) {
    return { ok: false, message: "Confira os horários informados." };
  }
  if (lunchStart >= lunchEnd) {
    return { ok: false, message: "O início do intervalo deve ser anterior ao fim." };
  }
  if (lunchStart < open || lunchEnd > close) {
    return { ok: false, message: "O intervalo deve ficar dentro do expediente." };
  }

  return {
    ok: true,
    schedule: {
      ...schedule,
      lunchStart: draft.lunchStart,
      lunchEnd: draft.lunchEnd,
    },
  };
};
