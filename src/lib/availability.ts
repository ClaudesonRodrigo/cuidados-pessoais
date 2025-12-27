import { AppointmentData, ScheduleData } from "./pageService";

export const generateAvailableSlots = (
  date: Date,
  durationMinutes: number,
  busyAppointments: AppointmentData[],
  schedule?: ScheduleData
): string[] => {
  const slots: string[] = [];

  // --- 1. FILTRO DE DIA DA SEMANA (A MÁGICA NOVA) ---
  // O método getDay() retorna: 0 (Domingo), 1 (Segunda) ... 6 (Sábado)
  // Se existir configuração de dias (workingDays) e o dia atual NÃO estiver nela...
  if (schedule?.workingDays && !schedule.workingDays.includes(date.getDay())) {
      // ...Retorna lista vazia. A loja está fechada hoje.
      return []; 
  }

  // --- 2. CONFIGURAÇÕES BÁSICAS ---
  // Se não tiver horário salvo, usa o padrão 09:00 as 19:00
  const openStr = schedule?.open || "09:00";
  const closeStr = schedule?.close || "19:00";
  const interval = 30; // Intervalo fixo entre horários (pode virar config no futuro)

  // Converte strings "HH:mm" para números
  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);

  // Cria as datas de referência para Abertura e Fechamento do dia
  const baseDate = new Date(date);
  baseDate.setHours(0, 0, 0, 0); // Zera hora para garantir

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

  // --- 4. LOOP GERADOR DE HORÁRIOS ---
  // Começa no horário de abrir e vai somando de 30 em 30 min
  let currentSlot = new Date(shopOpen);

  while (currentSlot < shopClose) {
      // Calcula quando esse atendimento terminaria
      const slotEnd = new Date(currentSlot.getTime() + durationMinutes * 60000);

      // Regra A: O atendimento não pode terminar depois que a loja fecha
      if (slotEnd > shopClose) {
          break; // Para o loop
      }

      // Regra B: Colisão com o Almoço
      let isLunchTime = false;
      if (lunchStart && lunchEnd) {
          // Se o horário cai dentro, começa dentro ou termina dentro do almoço
          if (
              (currentSlot >= lunchStart && currentSlot < lunchEnd) || // Começa no almoço
              (slotEnd > lunchStart && slotEnd <= lunchEnd) ||         // Termina no almoço
              (currentSlot < lunchStart && slotEnd > lunchEnd)         // Atravessa o almoço
          ) {
              isLunchTime = true;
          }
      }

      // Se não for almoço, verifica se já tem cliente agendado (Colisão com Agenda)
      if (!isLunchTime) {
          const isBusy = busyAppointments.some((app) => {
            // Garante que startAt e endAt sejam objetos Date (Firestore Timestamp conversion)
            const appStart = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any);
            const appEnd = (app.endAt as any).toDate ? (app.endAt as any).toDate() : new Date(app.endAt as any);
            
            // Lógica de colisão de intervalos
            return currentSlot < appEnd && slotEnd > appStart;
          });

          // Se estiver livre, adiciona na lista!
          if (!isBusy) {
            slots.push(currentSlot.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }));
          }
      }

      // Avança para o próximo slot (ex: 09:00 -> 09:30)
      currentSlot = new Date(currentSlot.getTime() + interval * 60000);
  }

  return slots;
};