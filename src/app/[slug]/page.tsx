// src/app/[slug]/page.tsx
'use client';

import { useEffect, useState, use } from 'react';
import { useAuth } from '@/context/AuthContext';
import { signInWithGoogle, signOutUser } from '@/lib/authService';
import { 
  getPageDataBySlug, getAppointmentsByDate, createAppointment, getAppointmentsByCustomer,
  PageData, LinkData, AppointmentData 
} from "@/lib/pageService";
import { generateAvailableSlots } from '@/lib/availability';
import { Timestamp } from 'firebase/firestore'; 
import Link from 'next/link';
import Image from 'next/image';
import { 
  FaMapMarkerAlt, FaWhatsapp, FaCut, FaCalendarAlt, FaClock, 
  FaCheckCircle, FaTimes, FaStoreSlash, FaExclamationTriangle, FaShoppingBag, FaCopy, FaQrcode, FaGoogle, FaHistory, FaSignOutAlt
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
}

// --- SKELETON ---
function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-gray-900 px-4 py-10 animate-pulse">
        <div className="w-24 h-24 bg-gray-700 rounded-full mx-auto mb-4"/>
        <div className="h-8 bg-gray-700 w-48 mx-auto mb-2 rounded"/>
        <div className="h-4 bg-gray-700 w-64 mx-auto mb-8 rounded"/>
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="bg-gray-800 h-28 rounded-xl w-full"/>)}</div>
    </div>
  );
}

// --- ERRO 404 ---
function NotFoundState() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center font-sans text-gray-800">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full border border-gray-100">
                <div className="bg-orange-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><FaExclamationTriangle className="text-orange-500 text-4xl" /></div>
                <h1 className="text-2xl font-bold mb-2">Barbearia não encontrada</h1>
                <p className="text-gray-500 mb-6">O link que você acessou não existe ou foi desativado.</p>
                <Link href="/" className="block w-full bg-gray-800 text-white py-3 rounded-xl font-bold hover:bg-black transition">Criar minha Página</Link>
            </div>
        </div>
    );
}

export default function SchedulingPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const { user } = useAuth(); // Hook de Autenticação
  
  const [pageData, setPageData] = useState<ExtendedPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  // CARRINHO & AGENDAMENTO
  const [cart, setCart] = useState<LinkData[]>([]); 
  const [isSelectorOpen, setIsSelectorOpen] = useState(false); 
  
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]); 
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

  // Carregar Dados
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

  // 2. Carregar Horários (CORRIGIDO)
  useEffect(() => {
    if (!pageData || totalDuration === 0 || !isSelectorOpen) return;

    const fetchSlots = async () => {
        setLoadingSlots(true);
        setAvailableSlots([]);

        // --- CORREÇÃO DE DATA NA BUSCA ---
        // Força o horário local (00:00:00) para evitar buscar o dia anterior (UTC)
        const dateStr = `${selectedDate}T00:00:00`; 
        
        const startOfDay = new Date(dateStr);
        const endOfDay = new Date(dateStr);
        endOfDay.setHours(23, 59, 59, 999); // Final do dia exato

        console.log("🔍 Buscando agenda para:", startOfDay.toLocaleString());

        // Busca o que já está ocupado no banco
        const busyAppointments = await getAppointmentsByDate(resolvedParams.slug, startOfDay, endOfDay);
        
        console.log("❌ Ocupados encontrados:", busyAppointments.length);

        // Calcula os buracos livres
        const slots = generateAvailableSlots(
            startOfDay, 
            totalDuration, 
            busyAppointments,
            pageData.schedule // AGORA PASSAMOS A CONFIG DO DONO
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
      setIsSelectorOpen(false); setSelectedTime(null);
  };

  const handleProceedToDate = () => {
      if (cart.length === 0) return alert("Escolha pelo menos um serviço.");
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
      try { 
          // AQUI: Força role 'customer' para quem entra pela vitrine
          await signInWithGoogle('customer'); 
      } catch (error) { 
          alert("Erro ao fazer login com Google."); 
      } 
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
          
          // --- CORREÇÃO DO BUG DE DATA (-1 DIA) ---
          // Antes: new Date(selectedDate) -> Interpretava como UTC (00:00 Londres = 21:00 Brasil Dia Anterior)
          // Agora: new Date(selectedDate + 'T00:00:00') -> Força interpretação como Horário Local do Navegador
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

          // WhatsApp (Lógica mantida)
          const phone = pageData.whatsapp?.replace(/\D/g, '') || '';
          let msg = `*NOVO AGENDAMENTO ✂️*\n\n`;
          msg += `👤 *Cliente:* ${customerName}\n`;
          msg += `📧 *Email:* ${user.email}\n`;
          msg += `📅 *Data:* ${startDate.toLocaleDateString('pt-BR')} às *${selectedTime}*\n`;
          msg += `🛒 *Serviços:* ${servicesString}\n`;
          msg += `⏱ *Duração:* ${totalDuration} min\n`;
          msg += `💰 *Total:* R$ ${totalPrice.toFixed(2)}\n\n`;
          msg += `_Solicitação enviada. Aguardando confirmação._`;

          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
          
          setIsCheckoutOpen(false);
          setCart([]);
          setIsSelectorOpen(false);

      } catch (error) {
          alert("Erro ao processar. Tente novamente.");
          console.error(error);
      } finally {
          setIsBooking(false);
      }
  };

  function handleLocation() { if (pageData?.address) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pageData.address)}`, '_blank'); }

  if (loading) return <MenuSkeleton />;
  if (error || !pageData) return <NotFoundState />;
  
  const isClosed = pageData.isOpen === false;
  const hasPix = !!pageData.pixKey; 

  return (
    <div className="min-h-screen font-sans text-white bg-gray-900 pb-40" 
         style={pageData.backgroundImage ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.95)), url(${pageData.backgroundImage})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' } : {}}>
      
      {/* HEADER */}
      <header className="pt-6 pb-6 px-4 relative">
        <div className="flex justify-between items-center mb-4">
             {/* ÁREA DO CLIENTE LOGADO */}
             {user ? (
                 <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                     {user.photoURL && <img src={user.photoURL} className="w-6 h-6 rounded-full border border-white/30" alt="avatar"/>}
                     <button onClick={handleOpenHistory} className="text-xs font-bold text-white hover:text-orange-400 transition flex items-center gap-1">
                         Meus Agendamentos
                     </button>
                 </div>
             ) : (
                 <button onClick={handleLogin} className="text-xs font-bold bg-white text-gray-900 px-3 py-1.5 rounded-full hover:bg-gray-100 flex items-center gap-2">
                     <FaGoogle/> Entrar
                 </button>
             )}

             {/* Logout (só se quiser sair da conta nessa página, opcional) */}
             {user && <button onClick={signOutUser} className="text-white/50 hover:text-white"><FaSignOutAlt/></button>}
        </div>

        <div className="text-center">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-orange-500 mx-auto bg-gray-800 mb-4 relative shadow-lg shadow-orange-500/20">
                {pageData.profileImageUrl ? <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" sizes="96px" priority /> : <div className="flex items-center justify-center h-full text-white/30 text-3xl"><FaCut/></div>}
            </div>
            <h1 className="text-2xl font-bold mb-2 text-white">{pageData.title}</h1>
            <p className="text-gray-400 text-sm max-w-md mx-auto">{pageData.bio}</p>
            {isClosed ? (
                <div className="bg-red-600/20 border border-red-500 text-red-400 text-xs font-bold px-4 py-2 rounded-full inline-flex items-center gap-2 mt-4"><FaStoreSlash/> FECHADO NO MOMENTO</div>
            ) : (
                pageData.address && <button onClick={handleLocation} className="mt-4 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 mx-auto transition"><FaMapMarkerAlt className="text-orange-500" /> Ver Endereço</button>
            )}
        </div>
      </header>

      <main className="container mx-auto max-w-lg px-4 space-y-8">
        
        {/* SERVIÇOS */}
        <div>
            <h2 className="text-orange-500 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2"><FaCut/> Escolha os Serviços</h2>
            <div className="space-y-3">
                {pageData.links?.map((item, index) => {
                    const isInCart = cart.some(i => i.title === item.title);
                    return (
                        <motion.div 
                            key={index} 
                            initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{delay: index*0.05}}
                            onClick={() => !isClosed && toggleCartItem(item)}
                            className={`bg-gray-800/50 border ${isInCart ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 hover:border-gray-600'} rounded-xl p-4 flex gap-4 cursor-pointer transition-all group relative`}
                        >
                            {isInCart && <div className="absolute top-2 right-2 text-orange-500 bg-orange-500/20 rounded-full p-1"><FaCheckCircle/></div>}
                            {item.imageUrl && <div className="w-16 h-16 rounded-lg bg-gray-700 relative overflow-hidden shrink-0"><Image src={item.imageUrl} alt={item.title} fill className="object-cover" sizes="64px" /></div>}
                            <div className="flex-1">
                                <div className="flex justify-between items-start pr-6">
                                    <h3 className={`font-bold ${isInCart ? 'text-orange-400' : 'text-white'}`}>{item.title}</h3>
                                    {item.price && <span className="text-white font-bold text-sm bg-gray-700 px-2 py-1 rounded">R$ {item.price}</span>}
                                </div>
                                <p className="text-xs text-gray-400 mt-1 line-clamp-1">{item.description}</p>
                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                    <FaClock size={10}/> {item.durationMinutes || 30} min
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>

        {/* CALENDÁRIO */}
        <AnimatePresence>
            {isSelectorOpen && !isClosed && (
                <motion.div id="date-picker-section" initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: 'auto'}} exit={{opacity: 0, height: 0}} className="space-y-6 pt-8 border-t border-gray-800">
                    <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700">
                        <h3 className="text-white font-bold mb-1 flex items-center gap-2"><FaShoppingBag className="text-orange-500"/> Resumo do Pedido</h3>
                        <p className="text-gray-400 text-xs">Você selecionou: <span className="text-white">{cart.map(i=>i.title).join(', ')}</span></p>
                        <p className="text-gray-400 text-xs">Tempo Total estimado: <span className="text-white font-bold">{totalDuration} min</span></p>
                    </div>
                    <div>
                        <h2 className="text-orange-500 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2"><FaCalendarAlt/> Escolha a Data</h2>
                        <input type="date" value={selectedDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl p-4 font-bold outline-none focus:border-orange-500" />
                    </div>
                    <div>
                        <h2 className="text-orange-500 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2"><FaClock/> Horários Disponíveis</h2>
                        {loadingSlots ? (
                            <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-orange-500 rounded-full border-t-transparent"/></div>
                        ) : availableSlots.length > 0 ? (
                            <div className="grid grid-cols-4 gap-2">
                                {availableSlots.map(time => (
                                    <button key={time} onClick={() => handleTimeClick(time)} className="bg-gray-800 border border-gray-700 hover:border-orange-500 hover:bg-orange-500 hover:text-white text-gray-300 py-2 rounded-lg text-sm font-bold transition">
                                        {time}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 bg-gray-800/30 rounded-xl border border-gray-800">
                                <p className="text-gray-400 text-sm">Nenhum horário livre para essa combinação.</p>
                                <p className="text-xs text-gray-600 mt-1">Tente diminuir os serviços ou mudar a data.</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </main>

      {/* FOOTER FIXO */}
      {!isSelectorOpen && cart.length > 0 && !isClosed && (
          <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-4 z-40 pb-8">
              <div className="container mx-auto max-w-lg flex items-center justify-between">
                  <div>
                      <p className="text-gray-400 text-xs">Total a pagar</p>
                      <p className="text-white font-bold text-xl">R$ {totalPrice.toFixed(2)}</p>
                  </div>
                  <button onClick={handleProceedToDate} className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-orange-900/20 transition">
                      Agendar Horário
                  </button>
              </div>
          </div>
      )}

      {/* MODAL CHECKOUT */}
      <AnimatePresence>
        {isCheckoutOpen && (
            <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm">
                <motion.div initial={{y: '100%'}} animate={{y: 0}} exit={{y: '100%'}} className="bg-gray-900 w-full max-w-sm sm:rounded-2xl rounded-t-3xl border border-gray-700 shadow-2xl relative max-h-[90vh] overflow-y-auto">
                    <div className="p-6 space-y-6">
                        <div className="flex justify-between items-start">
                            <div><h3 className="text-xl font-bold text-white">Confirmação</h3><p className="text-xs text-gray-400">Finalize para garantir seu horário</p></div>
                            <button onClick={() => setIsCheckoutOpen(false)} className="text-gray-500 hover:text-white bg-gray-800 p-2 rounded-full"><FaTimes/></button>
                        </div>

                        {!user ? (
                            <div className="bg-orange-900/20 border border-orange-500/50 rounded-xl p-6 text-center space-y-4">
                                <p className="text-orange-200 font-bold text-sm">🔒 Você precisa entrar para agendar</p>
                                <button onClick={handleLogin} className="w-full bg-white text-gray-900 font-bold py-3 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-100 transition"><FaGoogle className="text-red-500"/> Entrar com Google</button>
                            </div>
                        ) : (
                            <>
                                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 space-y-2 text-sm">
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-700">
                                    {/* 1. A imagem é condicional (só aparece se tiver URL) */}
                                    {user.photoURL && (
                                        <img src={user.photoURL} className="w-6 h-6 rounded-full" alt="avatar"/>
                                    )}
                                    
                                    {/* 2. O texto fica FORA da condição da foto, mas dentro da div */}
                                    <p className="text-gray-300 text-xs">
                                        Logado como <span className="text-white font-bold">{user.displayName}</span>
                                    </p>
                                </div>
                                    <div className="flex justify-between"><span className="text-gray-400">Data:</span> <span className="font-bold text-white">{new Date(selectedDate).toLocaleDateString('pt-BR')} às {selectedTime}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">Total:</span> <span className="font-bold text-green-400">R$ {totalPrice.toFixed(2)}</span></div>
                                </div>
                                {hasPix ? (
                                    <div className="bg-gray-800 p-4 rounded-xl text-center border border-dashed border-gray-600">
                                        <p className="text-orange-500 font-bold text-sm mb-3 flex justify-center items-center gap-2"><FaQrcode/> Pagamento via Pix</p>
                                        <div className="bg-white p-2 rounded inline-block mb-3"><QRCodeCanvas value={pageData.pixKey!} size={120} /></div>
                                        <button onClick={handleCopyPix} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 mx-auto transition border border-gray-600"><FaCopy/> {copyFeedback}</button>
                                    </div>
                                ) : ( <div className="bg-yellow-900/20 p-3 rounded-lg border border-yellow-700/50 text-center"><p className="text-yellow-500 text-xs">Pagamento no local.</p></div> )}
                                <div className="space-y-3 pt-2">
                                    <input type="tel" placeholder="Seu WhatsApp (para confirmação)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white outline-none focus:border-orange-500 transition" />
                                    <button onClick={handleConfirmBooking} disabled={isBooking || !customerPhone} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-lg shadow-lg shadow-green-900/20">{isBooking ? 'Agendando...' : <><FaWhatsapp size={22}/> {hasPix ? 'Enviar Comprovante' : 'Confirmar'}</>}</button>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL HISTÓRICO (NOVO) */}
      <AnimatePresence>
        {isHistoryOpen && (
             <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
                 <motion.div initial={{scale: 0.9}} animate={{scale: 1}} exit={{scale: 0.9}} className="bg-gray-900 w-full max-w-md rounded-2xl border border-gray-700 shadow-2xl relative max-h-[80vh] flex flex-col">
                     <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                         <h3 className="font-bold text-white flex items-center gap-2"><FaHistory className="text-orange-500"/> Meus Agendamentos</h3>
                         <button onClick={() => setIsHistoryOpen(false)} className="text-gray-500 hover:text-white"><FaTimes/></button>
                     </div>
                     <div className="p-4 overflow-y-auto flex-1 space-y-3">
                         {loadingHistory ? <div className="text-center text-gray-500 py-10">Carregando...</div> : historyApps.length === 0 ? <p className="text-center text-gray-500 py-10">Você ainda não tem agendamentos.</p> : (
                             historyApps.map(app => {
                                 let start: Date; try { start = (app.startAt as any).toDate ? (app.startAt as any).toDate() : new Date(app.startAt as any); } catch { start = new Date(); }
                                 const statusMap = { pending: { label: 'Aguardando Pagamento', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-800' }, confirmed: { label: 'Confirmado', color: 'text-green-400 bg-green-900/20 border-green-800' }, completed: { label: 'Concluído', color: 'text-blue-400 bg-blue-900/20 border-blue-800' }, cancelled: { label: 'Cancelado', color: 'text-red-400 bg-red-900/20 border-red-800' } };
                                 const st = statusMap[app.status || 'pending'];
                                 return (
                                     <div key={app.id} className={`p-3 rounded-lg border ${st.color} border border-opacity-50`}>
                                         <div className="flex justify-between items-start mb-1">
                                             <span className="font-bold text-white text-sm">{start.toLocaleDateString('pt-BR')} às {start.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
                                             <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${st.color}`}>{st.label}</span>
                                         </div>
                                         <p className="text-gray-400 text-xs line-clamp-1">{app.serviceName}</p>
                                         <p className="text-gray-500 text-[10px] mt-1">Total: R$ {app.totalValue?.toFixed(2)}</p>
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