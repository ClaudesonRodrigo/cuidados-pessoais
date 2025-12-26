// src/lib/availability.ts
import { AppointmentData, ScheduleData } from "./pageService";

export const generateAvailableSlots = (
  date: Date,
  durationMinutes: number,
  busyAppointments: AppointmentData[],
  schedule?: ScheduleData // Recebe a configuração do banco
): string[] => {
  const slots: string[] = [];
  
  // CONFIGURAÇÃO DA BARBEARIA (Pega do banco ou usa Padrão)
  const openStr = schedule?.open || "09:00";
  const closeStr = schedule?.close || "19:00";
  const interval = 30; // Minutos

  // Converte "HH:mm" para números
  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);

  // Normaliza a data base
  const baseDate = new Date(date);
  baseDate.setHours(0, 0, 0, 0);

  // Datas Limite do Dia (Abertura e Fechamento)
  const shopOpen = new Date(baseDate);
  shopOpen.setHours(openH, openM, 0, 0);

  const shopClose = new Date(baseDate);
  shopClose.setHours(closeH, closeM, 0, 0);

  // Datas do Almoço (Se existir)
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

  // Loop para criar os horários
  // Começamos do horário de abertura exato
  let currentSlot = new Date(shopOpen);

  while (currentSlot < shopClose) {
      
      // Horário que o cliente VAI SAIR (Fim do serviço)
      const slotEnd = new Date(currentSlot.getTime() + durationMinutes * 60000);

      // 1. Verifica se passa do horário de fechamento
      if (slotEnd > shopClose) {
          break; // Acabou o dia
      }

      // 2. Verifica se cai no Almoço (Colisão com intervalo)
      let isLunchTime = false;
      if (lunchStart && lunchEnd) {
          // Se o serviço começa dentro do almoço OU termina dentro do almoço OU "engloba" o almoço
          if (
              (currentSlot >= lunchStart && currentSlot < lunchEnd) || // Começa no almoço
              (slotEnd > lunchStart && slotEnd <= lunchEnd) ||         // Termina no almoço
              (currentSlot < lunchStart && slotEnd > lunchEnd)         // Atravessa o almoço
          ) {
              isLunchTime = true;
          }
      }

      if (!isLunchTime) {
          // 3. Verifica colisão com outros agendamentos (Lógica do Pulo do Gato)
          const isBusy = busyAppointments.some((app) => {
            const appStart = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any);
            const appEnd = (app.endAt as any).toDate ? (app.endAt as any).toDate() : new Date(app.endAt as any);
            
            // Colisão: (NovoInicio < VelhoFim) E (NovoFim > VelhoInicio)
            return currentSlot < appEnd && slotEnd > appStart;
          });

          if (!isBusy) {
            slots.push(currentSlot.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }));
          }
      }

      // Avança para o próximo slot (30 min)
      currentSlot = new Date(currentSlot.getTime() + interval * 60000);
  }

  return slots;
};