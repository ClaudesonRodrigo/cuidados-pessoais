// src/lib/availability.ts
import { AppointmentData } from "./pageService";

// Configuração Simples de Horário (Pode vir do banco depois)
const WORK_START_HOUR = 9; // Abre às 09:00
const WORK_END_HOUR = 19;  // Fecha às 19:00

export const generateAvailableSlots = (
  date: Date,
  durationMinutes: number,
  existingAppointments: AppointmentData[]
): string[] => {
  const slots: string[] = [];
  
  // Normaliza a data para começar às 09:00
  const startOfDay = new Date(date);
  startOfDay.setHours(WORK_START_HOUR, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(WORK_END_HOUR, 0, 0, 0);

  // Loop de tempo: Começa as 09:00 e vai somando a duração do serviço
  let currentTime = new Date(startOfDay);

  while (currentTime < endOfDay) {
    // Calcula o fim desse slot específico
    const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60000);

    // Se o serviço terminar depois que a loja fecha, para o loop
    if (slotEnd > endOfDay) break;

    // VERIFICAÇÃO DE COLISÃO (O Coração do Algoritmo)
    const isBusy = existingAppointments.some(app => {
      // Truque de Mestre: O Firebase retorna Timestamp, mas as vezes o Next.js serializa para String/Object.
      // O 'as any' com verificação .toDate() garante que não quebre.
      const appStart = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any);
      const appEnd = (app.endAt as any).toDate ? (app.endAt as any).toDate() : new Date(app.endAt as any);

      // Regra de Sobreposição de Horário:
      // (Slot começa antes do agendamento acabar) E (Slot termina depois do agendamento começar)
      return currentTime < appEnd && slotEnd > appStart;
    });

    // Se não estiver ocupado, adiciona na lista de disponíveis
    if (!isBusy) {
      // Formata HH:mm
      const timeString = currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      slots.push(timeString);
    }

    // Avança para o próximo horário
    currentTime = slotEnd;
  }

  return slots;
};