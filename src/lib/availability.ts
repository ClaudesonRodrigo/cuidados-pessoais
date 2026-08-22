import type { ScheduleData } from "./pageService";
import {
  evaluateCommercialScheduleRange,
  LEGACY_BUSINESS_TIME_ZONE,
  localDateTimeToUtc,
  NonexistentLocalDateTimeError,
  resolveBusinessTimeZone,
  weekdayForLocalDate,
} from "./timezone.ts";

type AvailabilityDate = Date | string | { toDate(): Date };

export type BusyIntervalInput = {
  startAt: AvailabilityDate;
  endAt: AvailabilityDate;
};

const toDate = (value: AvailabilityDate): Date => {
  if (value instanceof Date) return new Date(value);
  return typeof value === "object" && "toDate" in value ? value.toDate() : new Date(value);
};

export const generateAvailableSlots = (
  localDate: string,
  durationMinutes: number,
  busyAppointments: BusyIntervalInput[],
  schedule?: ScheduleData,
  timeZoneValue: unknown = LEGACY_BUSINESS_TIME_ZONE,
  now = new Date(),
): string[] => {
  const slots: string[] = [];
  const timeZone = resolveBusinessTimeZone(timeZoneValue);

  // --- 1. FILTRO DE DIA DA SEMANA ---
  // Se a barbearia não abre neste dia da semana, retorna vazio.
  if (schedule?.workingDays && !schedule.workingDays.includes(weekdayForLocalDate(localDate))) {
      return []; 
  }

  // --- 2. CONFIGURAÇÕES BÁSICAS ---
  const openStr = schedule?.open || "09:00";
  const closeStr = schedule?.close || "19:00";
  const interval = 30; // Intervalo de 30 em 30 min

  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  // --- 3. CONFIGURAÇÃO DE ALMOÇO ---
  let lunchStartMinutes: number | null = null;
  let lunchEndMinutes: number | null = null;

  if (schedule?.lunchStart && schedule?.lunchEnd) {
      const [lStartH, lStartM] = schedule.lunchStart.split(':').map(Number);
      const [lEndH, lEndM] = schedule.lunchEnd.split(':').map(Number);
      lunchStartMinutes = lStartH * 60 + lStartM;
      lunchEndMinutes = lEndH * 60 + lEndM;
  }

  // --- 4. REFERÊNCIA "AGORA" (Trava de Passado) ---
  // Dica: Adicionamos um "buffer" de segurança? 
  // Ex: Se for 13:05, o cliente não consegue mais pegar 13:00.

  // --- 5. LOOP GERADOR ---
  let currentMinutes = openMinutes;

  while (currentMinutes < closeMinutes) {
      const slotTime = String(Math.floor(currentMinutes / 60)).padStart(2, '0')
        + ':'
        + String(currentMinutes % 60).padStart(2, '0');
      let currentSlot: Date;
      try {
        currentSlot = localDateTimeToUtc(localDate, slotTime, timeZone);
      } catch (error) {
        if (!(error instanceof NonexistentLocalDateTimeError)) throw error;
        currentMinutes += interval;
        continue;
      }
      const slotEnd = new Date(currentSlot.getTime() + durationMinutes * 60000);
      const scheduleRange = evaluateCommercialScheduleRange({
        startAt: currentSlot,
        endAt: slotEnd,
        timeZone,
        openMinutes,
        closeMinutes,
        lunchStartMinutes,
        lunchEndMinutes,
      });
      if (!scheduleRange.withinSchedule || scheduleRange.overlapsLunch) {
        currentMinutes += interval;
        continue;
      }

      // Regra B (NOVA): O horário já passou?
      // Se o 'currentSlot' for menor que 'now', significa que é passado.
      // O sistema vai pular esse horário.
      if (currentSlot < now) {
          currentMinutes += interval;
          continue; // Pula para o próximo loop sem adicionar na lista
      }

      // Regra C: Colisão com Agendamentos Existentes (Cliente 01 vs Cliente 02)
      const isBusy = busyAppointments.some((app) => {
        const appStart = toDate(app.startAt);
        const appEnd = toDate(app.endAt);

        // Verifica se os horários se sobrepõem
        return currentSlot < appEnd && slotEnd > appStart;
      });

      // Se passou por todas as regras, o horário é válido!
      if (!isBusy) {
        slots.push(slotTime);
      }

      // Avança para o próximo intervalo
      currentMinutes += interval;
  }

  return slots;
};
