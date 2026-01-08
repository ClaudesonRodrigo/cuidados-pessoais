import { AppointmentData, ScheduleData } from "./pageService";

export const generateAvailableSlots = (
  date: Date,
  durationMinutes: number,
  busyAppointments: AppointmentData[],
  schedule?: ScheduleData
): string[] => {
  const slots: string[] = [];

  // --- 1. FILTRO DE DIA DA SEMANA ---
  // Se a barbearia não abre neste dia da semana, retorna vazio.
  if (schedule?.workingDays && !schedule.workingDays.includes(date.getDay())) {
      return []; 
  }

  // --- 2. CONFIGURAÇÕES BÁSICAS ---
  const openStr = schedule?.open || "09:00";
  const closeStr = schedule?.close || "19:00";
  const interval = 30; // Intervalo de 30 em 30 min

  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);

  // Define o horário de abertura e fechamento para o dia selecionado
  const baseDate = new Date(date);
  baseDate.setHours(0, 0, 0, 0);

  const shopOpen = new Date(baseDate);
  shopOpen.setHours(openH, openM, 0, 0);

  const shopClose = new Date(baseDate);
  shopClose.setHours(closeH, closeM, 0, 0);

  // --- 3. CONFIGURAÇÃO DE ALMOÇO ---
  let lunchStart: Date | null = null;
  let lunchEnd: Date | null = null;

  if (schedule?.lunchStart && schedule?.lunchEnd) {
      const [lStartH, lStartM] = schedule.lunchStart.split(':').map(Number);
      const [lEndH, lEndM] = schedule.lunchEnd.split(':').map(Number);
      
      lunchStart = new Date(baseDate);
      lunchStart.setHours(lStartH, lStartM, 0, 0);
      
      lunchEnd = new Date(baseDate);
      lunchEnd.setHours(lEndH, lEndM, 0, 0);
  }

  // --- 4. REFERÊNCIA "AGORA" (Trava de Passado) ---
  const now = new Date();
  // Dica: Adicionamos um "buffer" de segurança? 
  // Ex: Se for 13:05, o cliente não consegue mais pegar 13:00.
  
  // --- 5. LOOP GERADOR ---
  let currentSlot = new Date(shopOpen);

  while (currentSlot < shopClose) {
      const slotEnd = new Date(currentSlot.getTime() + durationMinutes * 60000);

      // Regra A: O atendimento não pode terminar depois que a loja fecha
      if (slotEnd > shopClose) {
          break;
      }

      // Regra B (NOVA): O horário já passou?
      // Se o 'currentSlot' for menor que 'now', significa que é passado.
      // O sistema vai pular esse horário.
      if (currentSlot < now) {
          currentSlot = new Date(currentSlot.getTime() + interval * 60000);
          continue; // Pula para o próximo loop sem adicionar na lista
      }

      // Regra C: Colisão com o Almoço
      let isLunchTime = false;
      if (lunchStart && lunchEnd) {
          if (
              (currentSlot >= lunchStart && currentSlot < lunchEnd) || 
              (slotEnd > lunchStart && slotEnd <= lunchEnd) ||         
              (currentSlot < lunchStart && slotEnd > lunchEnd)         
          ) {
              isLunchTime = true;
          }
      }

      // Regra D: Colisão com Agendamentos Existentes (Cliente 01 vs Cliente 02)
      if (!isLunchTime) {
          const isBusy = busyAppointments.some((app) => {
            const appStart = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any);
            const appEnd = (app.endAt as any).toDate ? (app.endAt as any).toDate() : new Date(app.endAt as any);
            
            // Verifica se os horários se sobrepõem
            return currentSlot < appEnd && slotEnd > appStart;
          });

          // Se passou por todas as regras, o horário é válido!
          if (!isBusy) {
            slots.push(currentSlot.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }));
          }
      }

      // Avança para o próximo intervalo
      currentSlot = new Date(currentSlot.getTime() + interval * 60000);
  }

  return slots;
};