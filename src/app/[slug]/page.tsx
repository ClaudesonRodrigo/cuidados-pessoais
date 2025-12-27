'use client';

import { useEffect, useState, use } from 'react';
import { useAuth } from '@/context/AuthContext';
import { signInWithGoogle, signOutUser } from '@/lib/authService';
import { 
  getPageDataBySlug, getAppointmentsByDate, createAppointment, getAppointmentsByCustomer,
  PageData, LinkData, AppointmentData, ScheduleData 
} from "@/lib/pageService";
import { generateAvailableSlots } from '@/lib/availability';
import { Timestamp } from 'firebase/firestore'; 
import Link from 'next/link';
import Image from 'next/image';
import { 
  FaMapMarkerAlt, FaWhatsapp, FaCut, FaCalendarAlt, FaClock, 
  FaCheckCircle, FaTimes, FaStoreSlash, FaExclamationTriangle, FaShoppingBag, FaCopy, FaQrcode, FaGoogle, FaHistory, FaSignOutAlt, FaChevronRight
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';

// --- TIPOS ---
interface ExtendedPageData extends PageData {
  backgroundImage?: string;
  plan?: string;
  isOpen?: boolean;
  whatsapp?: string;
  pixKey?: string;
  schedule?: ScheduleData; 
}

// --- SKELETON (Carregamento) ---
function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10 animate-pulse">
        <div className="w-24 h-24 bg-gray-800 rounded-full mx-auto mb-4"/>
        <div className="h-8 bg-gray-800 w-48 mx-auto mb-2 rounded"/>
        <div className="h-4 bg-gray-800 w-64 mx-auto mb-8 rounded"/>
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="bg-gray-900 h-24 rounded-xl w-full border border-gray-800"/>)}</div>
    </div>
  );
}

// --- ERRO 404 ---
function NotFoundState() {
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 text-center font-sans text-gray-200">
            <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-800">
                <div className="bg-orange-500/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><FaExclamationTriangle className="text-orange-500 text-4xl" /></div>
                <h1 className="text-2xl font-bold mb-2">Barbearia não encontrada</h1>
                <p className="text-gray-400 mb-6">O link que você acessou não existe ou foi desativado.</p>
                <Link href="/" className="block w-full bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition">Criar minha Página</Link>
            </div>
        </div>
    );
}

// --- UTILITÁRIO: GERAR DIAS (Horizontal Scroll) ---
const getNextDays = (days: number) => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dates.push({
            fullDate: d.toISOString().split('T')[0], // YYYY-MM-DD
            dayName: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0,3),
            dayNumber: d.getDate()
        });
    }
    return dates;
};

export default function SchedulingPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const { user } = useAuth();
  
  const [pageData, setPageData] = useState<ExtendedPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  // CARRINHO & AGENDAMENTO
  const [cart, setCart] = useState<LinkData[]>([]); 
  const [isSelectorOpen, setIsSelectorOpen] = useState(false); 
  
  // DATA SELECTION
  const nextDays = getNextDays(14); // Gera 14 dias
  const [selectedDate, setSelectedDate] = useState<string>(nextDays[0].fullDate); 
  
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  // MODAL DE CHECKOUT
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('Copiar Chave Pix');

  // MODAL DE HISTÓRICO
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyApps, setHistoryApps] = useState<AppointmentData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Cálculos
  const totalDuration = cart.reduce((acc, item) => acc + (item.durationMinutes || 30), 0);
  const totalPrice = cart.reduce((acc, item) => acc + parseFloat(item.price?.replace(',','.') || '0'), 0);

  // Auto-preencher nome se logado
  useEffect(() => {
      if (user?.displayName) setCustomerName(user.displayName);
  }, [user]);

  // Carregar Dados da Página
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await getPageDataBySlug(resolvedParams.slug) as ExtendedPageData | null;
        if (!data) setError(true); 
        else {
            setPageData(data);
            const theme = data.theme || 'dark';
            document.documentElement.className = "";
            if (data.backgroundImage) document.documentElement.classList.add('theme-custom-image');
            else document.documentElement.classList.add(`theme-${theme}`);
        }
      } catch (err) { setError(true); } finally { setLoading(false); }
    };
    fetchData();
  }, [resolvedParams.slug]);

  // Carregar Horários (Com Proteção de Dias Fechados)
  useEffect(() => {
    if (!pageData || totalDuration === 0 || !isSelectorOpen) return;

    const fetchSlots = async () => {
        setLoadingSlots(true);
        setAvailableSlots([]);

        // Força 00:00 local para evitar bugs de fuso
        const dateStr = `${selectedDate}T00:00:00`; 
        
        const startOfDay = new Date(dateStr);
        const endOfDay = new Date(dateStr);
        endOfDay.setHours(23, 59, 59, 999); 

        // --- TRAVA DE SEGURANÇA (FRONTEND) ---
        // Se o dia não estiver marcado como 'aberto' no painel, nem vai no banco.
        const dayOfWeek = startOfDay.getDay(); // 0 a 6
        if (pageData.schedule?.workingDays && !pageData.schedule.workingDays.includes(dayOfWeek)) {
             setAvailableSlots([]); // Retorna vazio (Fechado)
             setLoadingSlots(false);
             return;
        }

        // Busca ocupados no Banco
        const busyAppointments = await getAppointmentsByDate(resolvedParams.slug, startOfDay, endOfDay);

        // Calcula Livres
        const slots = generateAvailableSlots(
            startOfDay, 
            totalDuration, 
            busyAppointments,
            pageData.schedule 
        );

        setAvailableSlots(slots);
        setLoadingSlots(false);
    };

    fetchSlots();
  }, [selectedDate, totalDuration, pageData, resolvedParams.slug, isSelectorOpen]);

  // --- HANDLERS ---
  const toggleCartItem = (item: LinkData) => {
      const exists = cart.find(i => i.title === item.title);
      if (exists) setCart(cart.filter(i => i.title !== item.title));
      else setCart([...cart, item]);
      // Se mudar serviços, reseta seleção de hora mas mantém data
      setIsSelectorOpen(false); setSelectedTime(null);
  };

  const handleProceedToDate = () => {
      if (cart.length === 0) return alert("Escolha pelo menos um serviço.");
      setIsSelectorOpen(true);
      // Scroll suave até o calendário
      setTimeout(() => { document.getElementById('date-picker-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100);
  };

  const handleTimeClick = (time: string) => { setSelectedTime(time); setIsCheckoutOpen(true); };

  const handleCopyPix = () => {
      if (pageData?.pixKey) {
          navigator.clipboard.writeText(pageData.pixKey);
          setCopyFeedback("Copiado!"); setTimeout(() => setCopyFeedback("Copiar Chave Pix"), 2000);
      }
  };

  const handleLogin = async () => { 
      try { await signInWithGoogle('customer'); } 
      catch (error) { alert("Erro ao fazer login com Google."); } 
  };

  const handleOpenHistory = async () => {
      if (!user) return alert("Faça login primeiro!");
      setIsHistoryOpen(true);
      setLoadingHistory(true);
      const apps = await getAppointmentsByCustomer(resolvedParams.slug, user.uid);
      setHistoryApps(apps);
      setLoadingHistory(false);
  };

  const handleConfirmBooking = async () => {
      if (!customerName || !selectedTime || cart.length === 0 || !pageData || !user) return;
      setIsBooking(true);
      try {
          const [hours, minutes] = selectedTime.split(':').map(Number);
          
          const startDate = new Date(`${selectedDate}T00:00:00`);
          startDate.setHours(hours, minutes, 0, 0);

          const endDate = new Date(startDate.getTime() + totalDuration * 60000);
          const servicesString = cart.map(i => i.title).join(' + ');

          const newAppointment: AppointmentData = {
              pageSlug: resolvedParams.slug,
              serviceId: 'multi-services', 
              serviceName: servicesString, 
              customerId: user.uid,
              customerEmail: user.email || '',
              customerPhoto: user.photoURL || '',
              customerName,
              customerPhone, 
              startAt: Timestamp.fromDate(startDate),
              endAt: Timestamp.fromDate(endDate),
              status: 'pending', 
              totalValue: totalPrice,
              createdAt: Timestamp.now()
          };
          await createAppointment(newAppointment);

          const phone = pageData.whatsapp?.replace(/\D/g, '') || '';
          let msg = `*NOVO AGENDAMENTO ✂️*\n\n👤 *Cliente:* ${customerName}\n📧 *Email:* ${user.email}\n📅 *Data:* ${startDate.toLocaleDateString('pt-BR')} às *${selectedTime}*\n🛒 *Serviços:* ${servicesString}\n⏱ *Duração:* ${totalDuration} min\n💰 *Total:* R$ ${totalPrice.toFixed(2)}\n\n_Solicitação enviada. Aguardando confirmação._`;
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
          
          setIsCheckoutOpen(false); setCart([]); setIsSelectorOpen(false);
      } catch (error) { alert("Erro ao processar. Tente novamente."); } finally { setIsBooking(false); }
  };

  const handleLocation = () => { if(pageData?.address) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pageData.address)}`, '_blank'); };

  if (loading) return <MenuSkeleton />;
  if (error || !pageData) return <NotFoundState />;
  
  const isClosed = pageData.isOpen === false;
  const hasPix = !!pageData.pixKey; 

  return (
    <div className="min-h-screen font-sans text-white bg-gray-950 pb-40" 
         style={pageData.backgroundImage ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.95)), url(${pageData.backgroundImage})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' } : {}}>
      
      {/* HEADER */}
      <header className="pt-6 pb-6 px-4 relative max-w-lg mx-auto">
        <div className="flex justify-between items-center mb-6">
             {/* LOGIN/PERFIL */}
             {user ? (
                 <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 hover:bg-white/10 transition cursor-pointer" onClick={handleOpenHistory}>
                     {user.photoURL ? <img src={user.photoURL} className="w-6 h-6 rounded-full border border-white/20" alt="avatar"/> : <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-xs font-bold text-white">{user.displayName?.charAt(0)}</div>}
                     <span className="text-xs font-bold text-gray-300">Meus Cortes</span>
                 </div>
             ) : (
                 <button onClick={handleLogin} className="text-xs font-bold bg-white text-gray-900 px-4 py-2 rounded-full hover:bg-gray-200 flex items-center gap-2 shadow-lg shadow-white/5 transition">
                     <FaGoogle/> Entrar
                 </button>
             )}

             {user && <button onClick={signOutUser} className="text-gray-500 hover:text-white transition"><FaSignOutAlt/></button>}
        </div>

        <div className="text-center">
            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-gray-800 mx-auto bg-gray-900 mb-4 relative shadow-2xl shadow-orange-500/10 ring-2 ring-orange-500/50">
                {pageData.profileImageUrl ? <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" sizes="112px" priority /> : <div className="flex items-center justify-center h-full text-white/30 text-3xl"><FaCut/></div>}
            </div>
            <h1 className="text-2xl font-bold mb-2 text-white">{pageData.title}</h1>
            <p className="text-gray-400 text-sm max-w-xs mx-auto leading-relaxed">{pageData.bio}</p>
            {isClosed ? (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold px-4 py-2 rounded-full inline-flex items-center gap-2 mt-4"><FaStoreSlash/> LOJA FECHADA</div>
            ) : (
                pageData.address && <button onClick={handleLocation} className="mt-4 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-orange-500/30 text-gray-300 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 mx-auto transition"><FaMapMarkerAlt className="text-orange-500" /> Ver Endereço</button>
            )}
        </div>
      </header>

      <main className="container mx-auto max-w-lg px-4 space-y-8">
        
        {/* LISTA DE SERVIÇOS */}
        <div>
            <h2 className="text-gray-500 font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2 px-1">
                <FaCut className="text-orange-500"/> Selecione os Serviços
            </h2>
            <div className="space-y-3">
                {pageData.links?.map((item, index) => {
                    const isInCart = cart.some(i => i.title === item.title);
                    return (
                        <motion.div 
                            key={index} 
                            initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{delay: index*0.05}}
                            onClick={() => !isClosed && toggleCartItem(item)}
                            className={`relative overflow-hidden rounded-xl border p-4 flex gap-4 cursor-pointer transition-all duration-300 ${isInCart ? 'bg-orange-500/10 border-orange-500 shadow-lg shadow-orange-500/10' : 'bg-gray-900 border-gray-800 hover:border-gray-700'}`}
                        >
                            {/* Checkmark animado */}
                            <div className={`absolute top-3 right-3 transition-transform duration-300 ${isInCart ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                                <FaCheckCircle className="text-orange-500 text-xl bg-gray-900 rounded-full"/>
                            </div>

                            {item.imageUrl ? (
                                <div className="w-16 h-16 rounded-lg bg-gray-800 relative overflow-hidden shrink-0 border border-white/5">
                                    <Image src={item.imageUrl} alt={item.title} fill className="object-cover" sizes="64px" />
                                </div>
                            ) : (
                                <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 border border-white/5 text-gray-600">
                                    <FaCut/>
                                </div>
                            )}
                            
                            <div className="flex-1 pr-6">
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className={`font-bold text-base leading-tight ${isInCart ? 'text-white' : 'text-gray-200'}`}>{item.title}</h3>
                                </div>
                                <div className="flex items-center gap-3">
                                    {item.price && <span className="text-orange-400 font-bold text-sm">R$ {item.price}</span>}
                                    <div className="w-1 h-1 bg-gray-700 rounded-full"/>
                                    <span className="text-gray-500 text-xs flex items-center gap-1"><FaClock size={10}/> {item.durationMinutes || 30} min</span>
                                </div>
                                {item.description && <p className="text-xs text-gray-500 mt-2 line-clamp-1">{item.description}</p>}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>

        {/* SELEÇÃO DE DATA E HORA (Aparece ao selecionar serviço) */}
        <AnimatePresence>
            {isSelectorOpen && !isClosed && (
                <motion.div 
                    id="date-picker-section" 
                    initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: 'auto'}} exit={{opacity: 0, height: 0}} 
                    className="space-y-8 pt-8 border-t border-gray-800/50"
                >
                    {/* RESUMO RÁPIDO */}
                    <div className="flex justify-between items-center bg-gray-900 p-4 rounded-xl border border-gray-800">
                        <div>
                            <p className="text-gray-400 text-xs uppercase font-bold mb-1">Resumo do Pedido</p>
                            <p className="text-white text-sm font-medium">{cart.length} serviço(s) selecionado(s)</p>
                        </div>
                        <div className="text-right">
                            <p className="text-gray-400 text-xs uppercase font-bold mb-1">Tempo Total</p>
                            <p className="text-orange-500 font-bold text-lg">{totalDuration} min</p>
                        </div>
                    </div>

                    {/* HORIZONTAL DATE PICKER (COM BLOQUEIO DE DIAS) */}
                    <div>
                        <h2 className="text-gray-500 font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2 px-1">
                            <FaCalendarAlt className="text-orange-500"/> Escolha a Data
                        </h2>
                        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 snap-x">
                            {nextDays.map((day) => {
                                // Lógica de dia aberto/fechado
                                const dayDate = new Date(`${day.fullDate}T00:00:00`);
                                const dayOfWeek = dayDate.getDay();
                                
                                // Se não tiver a config, assume que abre todos os dias (segurança)
                                const isOpenDay = pageData.schedule?.workingDays 
                                    ? pageData.schedule.workingDays.includes(dayOfWeek)
                                    : true;

                                const isSelected = day.fullDate === selectedDate;
                                
                                return (
                                    <button 
                                        key={day.fullDate} 
                                        disabled={!isOpenDay} // Desabilita clique
                                        onClick={() => setSelectedDate(day.fullDate)}
                                        className={`flex-shrink-0 w-16 h-20 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border snap-center ${
                                            !isOpenDay 
                                            ? 'bg-gray-900 border-gray-800 opacity-30 cursor-not-allowed grayscale' // Estilo Bloqueado
                                            : isSelected 
                                                ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-900/50 scale-105' 
                                                : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600 hover:bg-gray-800'
                                        }`}
                                    >
                                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{day.dayName}</span>
                                        <span className="text-xl font-bold">
                                            {!isOpenDay ? <FaTimes size={14} className="mx-auto mt-1"/> : day.dayNumber}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* HORÁRIOS (GRID) */}
                    <div>
                        <h2 className="text-gray-500 font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2 px-1">
                            <FaClock className="text-orange-500"/> Horários Disponíveis
                        </h2>
                        {loadingSlots ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-3">
                                <div className="animate-spin w-6 h-6 border-2 border-orange-500 rounded-full border-t-transparent"/>
                                <span className="text-xs">Buscando disponibilidade...</span>
                            </div>
                        ) : availableSlots.length > 0 ? (
                            <div className="grid grid-cols-4 gap-3">
                                {availableSlots.map(time => (
                                    <button 
                                        key={time} 
                                        onClick={() => handleTimeClick(time)} 
                                        className="bg-gray-900 border border-gray-800 text-white py-3 rounded-lg text-sm font-bold hover:bg-orange-500 hover:border-orange-500 hover:shadow-lg transition active:scale-95"
                                    >
                                        {time}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 bg-gray-900/50 rounded-xl border border-gray-800 border-dashed">
                                <p className="text-gray-400 text-sm font-medium">Nenhum horário livre nesta data.</p>
                                <p className="text-xs text-gray-600 mt-2">Tente selecionar outro dia no calendário acima.</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </main>

      {/* FOOTER FLUTUANTE (Cart) */}
      {!isSelectorOpen && cart.length > 0 && !isClosed && (
          <motion.div initial={{y: 100}} animate={{y: 0}} className="fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-md border-t border-gray-800 p-4 z-40 pb-8 safe-area-pb">
              <div className="container mx-auto max-w-lg flex items-center justify-between">
                  <div className="flex flex-col">
                      <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Total Estimado</span>
                      <span className="text-white font-bold text-xl flex items-baseline gap-1">
                          R$ {totalPrice.toFixed(2)}
                          <span className="text-xs text-gray-500 font-normal">/ {totalDuration} min</span>
                      </span>
                  </div>
                  <button onClick={handleProceedToDate} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-orange-900/20 transition flex items-center gap-2">
                      Agendar <FaChevronRight size={12}/>
                  </button>
              </div>
          </motion.div>
      )}

      {/* MODAL CHECKOUT */}
      <AnimatePresence>
        {isCheckoutOpen && (
            <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm">
                <motion.div 
                    initial={{y: '100%'}} animate={{y: 0}} exit={{y: '100%'}} 
                    className="bg-gray-900 w-full max-w-sm sm:rounded-2xl rounded-t-3xl border border-gray-800 shadow-2xl relative max-h-[90vh] overflow-y-auto"
                >
                    <div className="p-6 space-y-6">
                        {/* Header Modal */}
                        <div className="flex justify-between items-start border-b border-gray-800 pb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white">Revisar e Confirmar</h3>
                                <p className="text-xs text-gray-400 mt-1">Quase lá! Confirme os dados abaixo.</p>
                            </div>
                            <button onClick={() => setIsCheckoutOpen(false)} className="text-gray-500 hover:text-white bg-gray-800 p-2 rounded-full transition"><FaTimes/></button>
                        </div>

                        {!user ? (
                            <div className="bg-gray-800 rounded-xl p-6 text-center space-y-4 border border-gray-700">
                                <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mx-auto text-2xl">🔒</div>
                                <div>
                                    <p className="text-white font-bold text-sm">Identifique-se para agendar</p>
                                    <p className="text-xs text-gray-400 mt-1">Usamos sua conta Google para segurança e histórico.</p>
                                </div>
                                <button onClick={handleLogin} className="w-full bg-white text-gray-900 font-bold py-3 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-100 transition shadow-lg">
                                    <FaGoogle className="text-red-500"/> Entrar com Google
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Resumo do Agendamento */}
                                <div className="space-y-4">
                                    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 space-y-3">
                                        <div className="flex items-center gap-3 pb-3 border-b border-gray-700">
                                            {user.photoURL && <img src={user.photoURL} className="w-8 h-8 rounded-full border border-gray-600" alt="avatar"/>}
                                            <div>
                                                <p className="text-xs text-gray-400">Cliente</p>
                                                <p className="text-white font-bold text-sm">{user.displayName}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-xs text-gray-400 mb-1">Data</p>
                                                <p className="text-white font-bold text-sm bg-gray-900 px-2 py-1 rounded border border-gray-800 inline-block">{new Date(selectedDate).toLocaleDateString('pt-BR')}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-400 mb-1">Horário</p>
                                                <p className="text-white font-bold text-sm bg-gray-900 px-2 py-1 rounded border border-gray-800 inline-block">{selectedTime}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400 mb-1">Serviços</p>
                                            <p className="text-gray-300 text-xs leading-relaxed">{cart.map(i => i.title).join(' + ')}</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center px-2">
                                        <span className="text-gray-400 text-sm">Valor Total</span>
                                        <span className="text-xl font-bold text-green-400">R$ {totalPrice.toFixed(2)}</span>
                                    </div>
                                </div>

                                {/* PIX AREA */}
                                {hasPix ? (
                                    <div className="bg-gray-800 p-4 rounded-xl text-center border border-dashed border-gray-600 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                                        <p className="text-white font-bold text-sm mb-4 flex justify-center items-center gap-2"><FaQrcode className="text-blue-400"/> Pagamento via Pix</p>
                                        <div className="bg-white p-3 rounded-lg inline-block mb-4 shadow-xl">
                                            <QRCodeCanvas value={pageData.pixKey!} size={130} />
                                        </div>
                                        <button onClick={handleCopyPix} className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition border border-gray-600">
                                            <FaCopy/> {copyFeedback}
                                        </button>
                                        <p className="text-[10px] text-gray-500 mt-2">Copie a chave e pague no seu app de banco.</p>
                                    </div>
                                ) : ( 
                                    <div className="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/30 flex items-center gap-3">
                                        <div className="bg-yellow-500/20 p-2 rounded-full text-yellow-500"><FaShoppingBag/></div>
                                        <div>
                                            <p className="text-yellow-500 font-bold text-sm">Pagamento no Local</p>
                                            <p className="text-yellow-500/70 text-xs">Pague diretamente na barbearia.</p>
                                        </div>
                                    </div> 
                                )}

                                {/* FORM WHATSAPP */}
                                <div className="space-y-3 pt-2">
                                    <label className="text-xs font-bold text-gray-400 ml-1">Seu WhatsApp (para confirmação)</label>
                                    <input 
                                        type="tel" 
                                        placeholder="(XX) 9XXXX-XXXX" 
                                        value={customerPhone} 
                                        onChange={e => setCustomerPhone(e.target.value)} 
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-white outline-none focus:border-orange-500 focus:bg-gray-800/80 transition font-bold" 
                                    />
                                    <button 
                                        onClick={handleConfirmBooking}
                                        disabled={isBooking || !customerPhone}
                                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-lg shadow-lg shadow-green-900/20 mt-4"
                                    >
                                        {isBooking ? 'Agendando...' : <><FaWhatsapp size={22}/> {hasPix ? 'Enviar Comprovante' : 'Confirmar Agendamento'}</>}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL HISTÓRICO */}
      <AnimatePresence>
        {isHistoryOpen && (
             <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
                 <motion.div initial={{scale: 0.9}} animate={{scale: 1}} exit={{scale: 0.9}} className="bg-gray-900 w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl relative max-h-[80vh] flex flex-col">
                     <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900 rounded-t-2xl">
                         <h3 className="font-bold text-white flex items-center gap-2"><FaHistory className="text-orange-500"/> Meus Agendamentos</h3>
                         <button onClick={() => setIsHistoryOpen(false)} className="text-gray-500 hover:text-white bg-gray-800 p-2 rounded-full"><FaTimes/></button>
                     </div>
                     <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-gray-950/50">
                         {loadingHistory ? <div className="text-center text-gray-500 py-10">Carregando...</div> : historyApps.length === 0 ? <div className="text-center text-gray-500 py-10 flex flex-col items-center"><FaCalendarAlt size={30} className="mb-2 opacity-20"/><p>Nenhum agendamento ainda.</p></div> : (
                             historyApps.map(app => {
                                 let start; try { start = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any); } catch { start = new Date(); }
                                 const statusMap = { pending: { label: 'Pendente', color: 'text-yellow-500 border-yellow-500/30 bg-yellow-500/10' }, confirmed: { label: 'Confirmado', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' }, completed: { label: 'Concluído', color: 'text-green-500 border-green-500/30 bg-green-500/10' }, cancelled: { label: 'Cancelado', color: 'text-red-500 border-red-500/30 bg-red-500/10' } };
                                 const st = statusMap[app.status || 'pending'];
                                 return (
                                     <div key={app.id} className={`p-4 rounded-xl border ${st.color} border bg-opacity-5 relative overflow-hidden`}>
                                         <div className="flex justify-between items-start mb-2 relative z-10">
                                             <div>
                                                 <span className="font-bold text-white text-base block">{start.toLocaleDateString('pt-BR')}</span>
                                                 <span className="text-sm opacity-80">{start.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
                                             </div>
                                             <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border border-opacity-20 ${st.color}`}>{st.label}</span>
                                         </div>
                                         <p className="text-gray-400 text-xs line-clamp-1 relative z-10">{app.serviceName}</p>
                                     </div>
                                 )
                             })
                         )}
                     </div>
                 </motion.div>
             </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}