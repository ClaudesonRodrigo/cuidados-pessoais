// src/app/[slug]/page.tsx
'use client';

import { useEffect, useState, use } from 'react';
import { useAuth } from '@/context/AuthContext';
import { signInWithGoogle, signOutUser } from '@/lib/authService';
import { 
  getPageDataBySlug, getAppointmentsByDate, createAppointment, getAppointmentsByCustomer,
  PageData, LinkData, AppointmentData, ScheduleData,
  getCustomerLoyalty, LoyaltyData 
} from "@/lib/pageService";
import { generateAvailableSlots } from '@/lib/availability';
import { Timestamp } from 'firebase/firestore'; 
import Link from 'next/link';
import Image from 'next/image';
import { 
  FaMapMarkerAlt, FaWhatsapp, FaMagic, FaCalendarAlt, FaClock, 
  FaCheckCircle, FaTimes, FaStoreSlash, FaExclamationTriangle, FaShoppingBag, FaCopy, FaQrcode, FaGoogle, FaHistory, FaSignOutAlt, FaChevronRight, FaGem
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import { LoyaltyCard } from '@/components/LoyaltyCard';

// --- TIPOS ---
interface ExtendedPageData extends PageData {
  backgroundImage?: string;
  plan?: string;
  isPro?: boolean; 
  isOpen?: boolean;
  whatsapp?: string;
  pixKey?: string;
  schedule?: ScheduleData; 
}

// --- SKELETON ---
function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-[#fdfaf9] px-4 py-10 animate-pulse flex flex-col items-center">
        <div className="w-28 h-28 bg-purple-100 rounded-full mb-6"/>
        <div className="h-8 bg-purple-100 w-48 mb-4 rounded-xl"/>
        <div className="space-y-4 w-full max-w-md">
            {[1,2,3].map(i => <div key={i} className="bg-white h-24 rounded-[2rem] w-full border border-purple-50 shadow-sm"/>)}
        </div>
    </div>
  );
}

// --- ERRO 404 ---
function NotFoundState() {
    return (
        <div className="min-h-screen bg-[#fdfaf9] flex flex-col items-center justify-center p-4 text-center">
            <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-sm w-full border border-purple-50">
                <div className="bg-purple-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><FaExclamationTriangle className="text-purple-500 text-4xl" /></div>
                <h1 className="text-2xl font-bold mb-3 font-serif-luxury italic text-gray-900">Salão não encontrado</h1>
                <Link href="/" className="block w-full bg-purple-600 text-white py-4 rounded-2xl font-bold hover:bg-purple-700 transition">Criar Página</Link>
            </div>
        </div>
    );
}

const getNextDays = (days: number) => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dates.push({
            fullDate: d.toISOString().split('T')[0],
            dayName: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.','').slice(0,3),
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
  const [cart, setCart] = useState<LinkData[]>([]); 
  const [isSelectorOpen, setIsSelectorOpen] = useState(false); 
  const nextDays = getNextDays(14);
  const [selectedDate, setSelectedDate] = useState<string>(nextDays[0].fullDate); 
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('Copiar Chave Pix');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyApps, setHistoryApps] = useState<AppointmentData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);

  const totalDuration = cart.reduce((acc, item) => acc + (item.durationMinutes || 30), 0);
  const totalPrice = cart.reduce((acc, item) => acc + parseFloat(item.price?.replace(',','.') || '0'), 0);

  useEffect(() => {
      if (user?.displayName) setCustomerName(user.displayName);
      if (user && resolvedParams.slug) {
          getCustomerLoyalty(resolvedParams.slug, user.uid).then(setLoyaltyData);
      }
  }, [user, resolvedParams.slug]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await getPageDataBySlug(resolvedParams.slug) as ExtendedPageData | null;
        if (!data) setError(true); 
        else {
            setPageData(data);
            const theme = data.theme || 'light';
            document.documentElement.className = "";
            document.documentElement.classList.add(`theme-${theme}`);
        }
      } catch (err) { setError(true); } finally { setLoading(false); }
    };
    fetchData();
  }, [resolvedParams.slug]);

  useEffect(() => {
    if (!pageData || totalDuration === 0 || !isSelectorOpen) return;
    const fetchSlots = async () => {
        setLoadingSlots(true);
        const dateStr = `${selectedDate}T00:00:00`; 
        const startOfDay = new Date(dateStr);
        const endOfDay = new Date(dateStr);
        endOfDay.setHours(23, 59, 59, 999); 
        const dayOfWeek = startOfDay.getDay();
        if (pageData.schedule?.workingDays && !pageData.schedule.workingDays.includes(dayOfWeek)) {
             setAvailableSlots([]);
             setLoadingSlots(false);
             return;
        }
        const busyAppointments = await getAppointmentsByDate(resolvedParams.slug, startOfDay, endOfDay);
        const slots = generateAvailableSlots(startOfDay, totalDuration, busyAppointments, pageData.schedule);
        setAvailableSlots(slots);
        setLoadingSlots(false);
    };
    fetchSlots();
  }, [selectedDate, totalDuration, pageData, resolvedParams.slug, isSelectorOpen]);

  const toggleCartItem = (item: LinkData) => {
      const exists = cart.find(i => i.title === item.title);
      if (exists) setCart(cart.filter(i => i.title !== item.title));
      else setCart([...cart, item]);
      setIsSelectorOpen(false); setSelectedTime(null);
  };

  const handleProceedToDate = () => {
      if (cart.length === 0) return;
      setIsSelectorOpen(true);
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
      catch (error) { alert("Erro ao fazer login."); } 
  };

  const handleOpenHistory = async () => {
      if (!user) return;
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
          let msg = `*NOVO AGENDAMENTO 💅*\n\n👤 *Cliente:* ${customerName}\n📅 *Data:* ${startDate.toLocaleDateString('pt-BR')} às *${selectedTime}*\n✨ *Serviços:* ${servicesString}\n💰 *Total:* R$ ${totalPrice.toFixed(2)}`;
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
          
          setIsCheckoutOpen(false); setCart([]); setIsSelectorOpen(false);
      } catch (error) { alert("Erro ao agendar."); } finally { setIsBooking(false); }
  };

  if (loading) return <MenuSkeleton />;
  if (error || !pageData) return <NotFoundState />;
  
  const isClosed = pageData.isOpen === false;
  
  // 🔥 LÓGICA DE LIBERAÇÃO PRO (REVISADA PARA FUNCIONAR)
  // Verificamos se o plano é 'pro' OU se isPro é verdadeiro no documento da página pública.
  const showPixQRCode = !!pageData.pixKey && (pageData.plan === 'pro' || pageData.isPro === true); 

  return (
    <div className="min-h-screen font-sans text-gray-900 bg-[#fdfaf9] pb-40">
      
      {/* HEADER LUXURY */}
      <header className="pt-10 pb-8 px-4 max-w-lg mx-auto text-center relative">
        <div className="flex justify-between items-center mb-10">
              {user ? (
                  <div className="flex items-center gap-3 bg-purple-50 px-5 py-2.5 rounded-full border border-purple-100 cursor-pointer shadow-sm" onClick={handleOpenHistory}>
                      {user.photoURL ? <img src={user.photoURL} className="w-7 h-7 rounded-full shadow-sm" alt="avatar"/> : <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-black text-white uppercase">{user.displayName?.charAt(0)}</div>}
                      <span className="text-xs font-black text-purple-600 uppercase tracking-tighter">Minha Agenda</span>
                  </div>
              ) : (
                  <button onClick={handleLogin} className="text-xs font-black bg-gray-900 text-white px-6 py-3 rounded-full flex items-center gap-2 shadow-xl shadow-gray-200 transition hover:bg-black uppercase tracking-tighter">
                      <FaGoogle className="text-red-400"/> Entrar
                  </button>
              )}
              {user && <button onClick={signOutUser} className="bg-white p-2.5 rounded-full shadow-sm border border-gray-100 text-gray-300 hover:text-red-500 transition"><FaSignOutAlt size={14}/></button>}
        </div>

        <div className="w-32 h-32 rounded-full overflow-hidden border-[6px] border-white mx-auto bg-purple-50 mb-6 relative shadow-2xl">
            {pageData.profileImageUrl ? (
                <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" sizes="128px" priority />
            ) : (
                <div className="flex items-center justify-center h-full text-purple-200 text-5xl"><FaMagic/></div>
            )}
        </div>
        
        <h1 className="text-3xl font-bold mb-3 font-serif-luxury italic text-gray-900 leading-tight">{pageData.title}</h1>
        <p className="text-gray-400 text-sm max-w-xs mx-auto leading-relaxed font-medium mb-8">{pageData.bio}</p>
        
        {user && loyaltyData && (
            <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="mb-8">
                <LoyaltyCard points={loyaltyData.points} rewards={loyaltyData.totalRewards} customerName={user.displayName?.split(' ')[0] || 'Cliente VIP'} />
            </motion.div>
        )}

        {isClosed ? (
            <div className="bg-red-50 text-red-500 text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-full inline-flex items-center gap-2 border border-red-100 shadow-sm"><FaStoreSlash/> Salão Fechado</div>
        ) : (
            pageData.address && (
                <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pageData.address!)}`, '_blank')} className="bg-white border border-purple-50 text-gray-400 px-6 py-3 rounded-full text-xs font-black uppercase tracking-tighter flex items-center gap-2 mx-auto shadow-sm hover:bg-purple-50 transition">
                    <FaMapMarkerAlt className="text-purple-400" /> Ver Localização
                </button>
            )
        )}
      </header>

      <main className="max-w-lg mx-auto px-4 space-y-10">
        
        <section>
            <div className="flex items-center justify-between mb-6 px-1">
                <h2 className="text-purple-400 font-black text-[10px] uppercase tracking-[0.25em] flex items-center gap-2">
                    <FaMagic className="text-purple-300"/> Rituais de Beleza
                </h2>
            </div>
            
            <div className="space-y-4">
                {pageData.links?.map((item, index) => {
                    const isInCart = cart.some(i => i.title === item.title);
                    return (
                        <motion.div 
                            key={index} 
                            initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{delay: index*0.05}}
                            onClick={() => !isClosed && toggleCartItem(item)}
                            className={`group relative overflow-hidden rounded-[2.2rem] border p-5 flex gap-5 cursor-pointer transition-all duration-500 ${isInCart ? 'bg-white border-purple-200 shadow-[0_20px_40px_rgba(139,92,246,0.12)] scale-[1.03]' : 'bg-white border-purple-50/50 hover:border-purple-200 shadow-sm'}`}
                        >
                            <div className={`absolute top-5 right-6 transition-all duration-500 ${isInCart ? 'scale-110 opacity-100' : 'scale-0 opacity-0'}`}>
                                <div className="bg-purple-600 p-1.5 rounded-full shadow-lg shadow-purple-200"><FaCheckCircle className="text-white text-xl"/></div>
                            </div>

                            <div className="w-20 h-20 rounded-2xl bg-purple-50 relative overflow-hidden shrink-0 border border-purple-100/50 group-hover:scale-105 transition-transform duration-500">
                                {item.imageUrl ? <Image src={item.imageUrl} alt={item.title} fill className="object-cover" sizes="80px" /> : <div className="flex items-center justify-center h-full text-purple-200 text-3xl"><FaGem/></div>}
                            </div>
                            
                            <div className="flex-1 pr-8 py-1 flex flex-col justify-center">
                                <h3 className={`font-bold text-[1.05rem] leading-snug mb-1.5 transition-colors ${isInCart ? 'text-gray-900' : 'text-gray-700 group-hover:text-purple-600'}`}>{item.title}</h3>
                                <div className="flex items-center gap-4">
                                    {item.price && <span className="text-purple-600 font-black text-sm tracking-tight">R$ {item.price}</span>}
                                    <div className="w-1 h-1 bg-purple-100 rounded-full"/>
                                    <span className="text-gray-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><FaClock size={10}/> {item.durationMinutes || 30} MIN</span>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </section>

        <AnimatePresence>
            {isSelectorOpen && !isClosed && (
                <motion.section id="date-picker-section" initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: 20}} className="space-y-8 pt-4">
                    <div className="bg-white p-7 rounded-[2.5rem] border border-purple-50 shadow-xl shadow-purple-50/50">
                        <div className="flex items-center gap-2 mb-6">
                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"/><p className="text-[10px] uppercase font-black tracking-[0.2em] text-purple-300">Escolha o dia</p>
                        </div>
                        
                        <div className="flex gap-3 overflow-x-auto pb-6 scrollbar-hide -mx-2 px-2 snap-x">
                            {nextDays.map((day) => {
                                const dayDate = new Date(`${day.fullDate}T00:00:00`);
                                const dayOfWeek = dayDate.getDay();
                                const isOpenDay = pageData.schedule?.workingDays ? pageData.schedule.workingDays.includes(dayOfWeek) : true;
                                const isSelected = day.fullDate === selectedDate;
                                return (
                                    <button 
                                        key={day.fullDate} 
                                        disabled={!isOpenDay} 
                                        onClick={() => setSelectedDate(day.fullDate)}
                                        className={`shrink-0 w-16 h-22 rounded-[1.4rem] flex flex-col items-center justify-center gap-2 transition-all duration-300 border snap-center ${!isOpenDay ? 'bg-gray-50 border-gray-100 opacity-25 grayscale cursor-not-allowed' : isSelected ? 'bg-purple-600 border-purple-500 text-white shadow-2xl shadow-purple-200 scale-110' : 'bg-white border-purple-50 text-gray-400 hover:border-purple-200'}`}
                                    >
                                        <span className="text-[9px] font-black uppercase tracking-tighter">{day.dayName}</span>
                                        <span className="text-xl font-black">{!isOpenDay ? <FaTimes size={12}/> : day.dayNumber}</span>
                                    </button>
                                )
                            })}
                        </div>

                        <div className="mt-6 pt-8 border-t border-purple-50/50">
                            {loadingSlots ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-4">
                                    <div className="w-8 h-8 border-2 border-purple-500 rounded-full border-t-transparent animate-spin"/>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-purple-200">Consultando Agenda...</span>
                                </div>
                            ) : availableSlots.length > 0 ? (
                                <div className="grid grid-cols-4 gap-3">
                                    {availableSlots.map(time => (
                                        <button key={time} onClick={() => handleTimeClick(time)} className="bg-white border border-purple-50 text-gray-700 py-3.5 rounded-2xl text-xs font-black hover:bg-purple-600 hover:text-white transition-all duration-300 shadow-sm active:scale-95">{time}</button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-purple-50/30 rounded-[2rem] border border-purple-100 border-dashed text-gray-400 text-xs font-bold uppercase tracking-widest">Sem horários</div>
                            )}
                        </div>
                    </div>
                </motion.section>
            )}
        </AnimatePresence>
      </main>

      {!isSelectorOpen && cart.length > 0 && !isClosed && (
          <div className="fixed bottom-8 left-0 right-0 px-6 z-40">
              <motion.div initial={{y: 100}} animate={{y: 0}} className="max-w-lg mx-auto bg-gray-900 rounded-[2.8rem] p-5 shadow-[0_30px_60px_rgba(0,0,0,0.3)] flex items-center justify-between border border-white/10 backdrop-blur-lg">
                  <div className="pl-6">
                      <p className="text-gray-500 text-[9px] uppercase font-black tracking-[0.2em] mb-1">Valor Total</p>
                      <p className="text-white font-black text-2xl tracking-tighter flex items-baseline gap-1.5">R$ {totalPrice.toFixed(2)}</p>
                  </div>
                  <button onClick={handleProceedToDate} className="bg-purple-600 text-white px-10 py-5 rounded-[2.2rem] font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-purple-900/40 hover:bg-purple-500 transition transform active:scale-95 flex items-center gap-3">Próximo <FaChevronRight size={10}/></button>
              </motion.div>
          </div>
      )}

      {/* CHECKOUT MODAL QRCODE RESTAURADO */}
      <AnimatePresence>
        {isCheckoutOpen && (
            <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-4">
                <motion.div initial={{y: 100}} animate={{y: 0}} exit={{y: 100}} className="bg-white w-full max-w-md rounded-[3.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.4)] overflow-hidden border border-purple-50">
                    <div className="p-10 space-y-8">
                        <div className="flex justify-between items-start">
                            <div><h3 className="text-3xl font-bold font-serif-luxury italic text-gray-900">Finalizar</h3><p className="text-[10px] uppercase font-black tracking-widest text-purple-300 mt-2">Confirme sua Reserva VIP</p></div>
                            <button onClick={() => setIsCheckoutOpen(false)} className="bg-gray-50 text-gray-300 hover:text-purple-600 p-3 rounded-full transition-all"><FaTimes size={18}/></button>
                        </div>

                        <div className="bg-purple-50/50 p-6 rounded-[2.2rem] border border-purple-100 space-y-5">
                             <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-purple-400"><span>{new Date(selectedDate).toLocaleDateString('pt-BR')}</span><span>{selectedTime}</span></div>
                             <p className="text-gray-900 font-bold text-sm leading-relaxed">{cart.map(i => i.title).join(' + ')}</p>
                             <div className="flex justify-between items-center pt-4 border-t border-purple-100"><span className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Investimento</span><span className="text-3xl font-black text-purple-600 tracking-tighter">R$ {totalPrice.toFixed(2)}</span></div>
                        </div>

                        {/* ÁREA DE PAGAMENTO DINÂMICA (PRO) */}
                        {showPixQRCode ? (
                            <div className="bg-white p-7 rounded-[2.8rem] text-center border border-purple-100 shadow-inner group">
                                <p className="text-[10px] font-black uppercase text-purple-400 mb-5 flex items-center justify-center gap-2 tracking-[0.2em]"><FaQrcode/> Pagamento Pix</p>
                                <div className="p-4 bg-white border border-purple-50 rounded-3xl inline-block mb-6 shadow-2xl shadow-purple-100 group-hover:scale-105 transition-transform duration-500">
                                    <QRCodeCanvas value={pageData.pixKey!} size={160} />
                                </div>
                                <button onClick={handleCopyPix} className="w-full bg-purple-50 text-purple-600 py-4.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-purple-100 flex items-center justify-center gap-3 hover:bg-purple-100 transition-all">
                                    <FaCopy/> {copyFeedback}
                                </button>
                            </div>
                        ) : ( 
                            <div className="bg-gray-50 p-6 rounded-[2.2rem] border border-gray-100 flex items-center gap-5">
                                <div className="bg-white p-4 rounded-2xl shadow-sm text-purple-300"><FaShoppingBag size={20}/></div>
                                <div><p className="text-gray-900 font-black uppercase tracking-tighter text-sm">Pagamento no Local</p><p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Pague após o atendimento</p></div>
                            </div> 
                        )}

                        {!user ? (
                            <button onClick={handleLogin} className="w-full bg-white border-2 border-gray-900 text-gray-900 font-black py-5 rounded-[2rem] flex items-center justify-center gap-4 hover:bg-gray-900 hover:text-white transition-all shadow-xl shadow-gray-200 uppercase tracking-widest text-xs"><FaGoogle className="text-red-500 text-lg"/> Entrar com Google</button>
                        ) : (
                            <div className="space-y-5">
                                <input type="tel" placeholder="WhatsApp (00) 90000-0000" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full bg-purple-50/50 border border-purple-50 rounded-[1.5rem] p-5 text-gray-900 outline-none focus:border-purple-400 focus:bg-white transition font-black text-sm" />
                                <button onClick={handleConfirmBooking} disabled={isBooking || !customerPhone} className="w-full bg-purple-600 text-white font-black py-6 rounded-[2.2rem] shadow-2xl shadow-purple-900/40 transition-all hover:bg-purple-700 disabled:opacity-30 uppercase tracking-[0.2em] text-[11px] flex items-center justify-center gap-3 active:scale-95">
                                    {isBooking ? 'Reservando...' : <><FaCheckCircle/> Confirmar Agendamento</>}
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* HISTÓRICO PREMIUM */}
      <AnimatePresence>
        {isHistoryOpen && (
             <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
                 <motion.div initial={{scale: 0.95}} animate={{scale: 1}} exit={{scale: 0.95}} className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl border border-purple-50 relative max-h-[85vh] flex flex-col overflow-hidden">
                     <div className="p-8 border-b border-purple-50 flex justify-between items-center bg-white">
                         <div><h3 className="font-bold text-gray-900 text-xl font-serif-luxury italic">Minha Agenda</h3><p className="text-[9px] font-black uppercase tracking-widest text-purple-300">Seus rituais</p></div>
                         <button onClick={() => setIsHistoryOpen(false)} className="bg-gray-50 text-gray-300 hover:text-red-400 p-3 rounded-full transition-all"><FaTimes/></button>
                     </div>
                     <div className="p-8 overflow-y-auto flex-1 space-y-4 bg-[#fdfaf9]">
                         {loadingHistory ? <div className="text-center py-20 text-purple-200 animate-pulse uppercase text-[10px] tracking-widest">Buscando...</div> : historyApps.map(app => {
                                 let start; try { start = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any); } catch { start = new Date(); }
                                 const statusMap = { pending: { label: 'Pendente', color: 'text-amber-500 bg-amber-50' }, confirmed: { label: 'Confirmado', color: 'text-blue-500 bg-blue-50' }, completed: { label: 'Realizado', color: 'text-purple-600 bg-purple-50' }, cancelled: { label: 'Cancelado', color: 'text-red-400 bg-red-50' } };
                                 const st = statusMap[app.status || 'pending'];
                                 return (
                                     <div key={app.id} className="p-6 rounded-[2rem] bg-white border border-purple-50 shadow-sm">
                                         <div className="flex justify-between items-start mb-2">
                                             <div><span className="font-black text-gray-900 block tracking-tighter">{start.toLocaleDateString('pt-BR')}</span><span className="text-[10px] font-bold text-gray-400">{start.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span></div>
                                             <span className={`text-[8px] uppercase font-black px-3 py-1.5 rounded-full border ${st.color}`}>{st.label}</span>
                                         </div>
                                         <p className="text-gray-500 text-[11px] font-medium">{app.serviceName}</p>
                                     </div>
                                 )
                         })}
                     </div>
                 </motion.div>
             </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}