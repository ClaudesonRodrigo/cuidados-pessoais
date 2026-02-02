'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import React, { useState, useRef } from 'react';
import { 
  FaMagic, FaCalendarAlt, FaWhatsapp, FaCheck, FaRocket, FaMobileAlt, 
  FaMoneyBillWave, FaArrowRight, FaStar, FaQuestionCircle, FaChevronDown, 
  FaPlay, FaGem, FaSpa, FaCrown, FaCheckCircle, FaChartLine, FaHistory
} from 'react-icons/fa';
import Image from 'next/image';

// --- COMPONENTES VISUAIS DE ELITE (TIPADOS CORRETAMENTE) ---

interface FloatingBadgeProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const FloatingBadge: React.FC<FloatingBadgeProps> = ({ children, className, style }) => (
  <motion.div 
    animate={{ y: [0, -10, 0] }}
    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    style={style}
    className={`absolute bg-white/90 backdrop-blur-md border border-purple-100 p-4 rounded-2xl shadow-2xl z-20 flex items-center gap-3 ${className}`}
  >
    {children}
  </motion.div>
);

const CalendarMockup = () => (
  <div className="relative group">
    <div className="absolute -inset-4 bg-linear-to-r from-purple-500/20 to-pink-500/20 rounded-[3rem] blur-2xl group-hover:opacity-100 transition duration-1000 opacity-70" />
    <div className="bg-white border border-purple-50 rounded-[2.5rem] p-8 w-full max-w-sm shadow-[0_50px_100px_rgba(139,92,246,0.1)] relative overflow-hidden">
        <div className="flex justify-between items-center mb-8 border-b border-purple-50 pb-5">
            <div>
                <span className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] block mb-1">Agenda Inteligente</span>
                <span className="text-sm font-black text-gray-900 uppercase tracking-tighter">Sexta, 14 de Março</span>
            </div>
            <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-400"><FaCalendarAlt/></div>
        </div>
        <div className="space-y-4">
            {[
                { t: "09:00", n: "Camila Borges", s: "Mechas & Glow", c: "bg-purple-50 text-purple-600 border-purple-100" },
                { t: "10:30", n: "Livre", s: "Disponível para Agendamento", c: "bg-gray-50 text-gray-300 border-dashed border-gray-200" },
                { t: "14:00", n: "Fernanda Lima", s: "Design de Sobrancelhas", c: "bg-pink-50 text-pink-600 border-pink-100" },
            ].map((item, i) => (
                <div key={i} className="flex gap-4 items-center">
                    <div className="text-[10px] font-black text-gray-400 w-10">{item.t}</div>
                    <div className={`h-12 rounded-2xl flex-1 flex flex-col justify-center px-4 text-[11px] font-bold border transition-all ${item.c}`}>
                        <span className="truncate">{item.n}</span>
                        <span className="text-[9px] opacity-60 font-medium">{item.s}</span>
                    </div>
                </div>
            ))}
        </div>
        <div className="mt-8 bg-linear-to-r from-gray-900 to-gray-800 rounded-2xl p-4 flex items-center justify-between shadow-xl">
            <span className="text-white text-[10px] font-black uppercase tracking-widest">Faturamento Hoje</span>
            <span className="text-purple-400 font-black text-sm">R$ 1.250,00</span>
        </div>
    </div>
  </div>
);

const FaqItem = ({ question, answer }: { question: string, answer: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="group border-b border-purple-50">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full py-6 flex justify-between items-center text-left hover:text-purple-600 transition-all">
                <span className="font-bold text-lg text-gray-800 tracking-tight">{question}</span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isOpen ? 'bg-purple-600 text-white rotate-180' : 'bg-purple-50 text-purple-300'}`}>
                    <FaChevronDown size={12}/>
                </div>
            </button>
            <motion.div initial={false} animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }} className="overflow-hidden">
                <p className="pb-6 text-gray-500 leading-relaxed max-w-2xl">{answer}</p>
            </motion.div>
        </div>
    )
}

export default function Home() {
  const steps = [
    {
      icon: <FaMobileAlt />,
      title: "Reserva Digital",
      desc: "Sua cliente agenda em segundos através de um link exclusivo na sua Bio do Instagram.",
      color: "bg-blue-50 text-blue-500"
    },
    {
      icon: <FaSpa />,
      title: "Confirmação VIP",
      desc: "O sistema bloqueia o horário e envia lembretes automáticos para evitar faltas.",
      color: "bg-purple-50 text-purple-500"
    },
    {
      icon: <FaGem />,
      title: "Faturamento PRO",
      desc: "Receba via Pix no ato do agendamento e controle seu financeiro em tempo real.",
      color: "bg-pink-50 text-pink-500"
    }
  ];

  return (
    <div className="min-h-screen bg-[#fdfaf9] text-gray-900 font-sans selection:bg-purple-200 overflow-x-hidden">
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-2xl border-b border-purple-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-2 text-2xl font-bold tracking-tighter">
            <div className="bg-linear-to-br from-purple-600 to-pink-500 text-white p-2.5 rounded-[0.9rem] shadow-lg shadow-purple-200"><FaMagic size={18}/></div>
            <span className="text-gray-900">Beauty<span className="text-purple-600 font-light">Pro</span></span>
          </div>
          <div className="flex gap-8 items-center">
            <Link href="/admin/login" className="hidden sm:block text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 hover:text-purple-600 transition">Entrar</Link>
            <Link href="/admin/login" className="bg-gray-900 text-white px-8 py-3.5 rounded-full text-xs font-black uppercase tracking-widest hover:bg-purple-600 transition shadow-xl active:scale-95">
              Começar Agora
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="relative pt-48 pb-32 px-6">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-purple-200/20 rounded-full blur-[150px] -z-10 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-pink-100/20 rounded-full blur-[120px] -z-10" />

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-12 text-center lg:text-left">
            <motion.div 
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white border border-purple-100 shadow-sm text-purple-600 text-[10px] font-black uppercase tracking-[0.2em]"
            >
               <span className="flex h-2 w-2 rounded-full bg-purple-500 animate-ping"/>
               O futuro da estética digital
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="text-7xl md:text-8xl font-black tracking-tighter leading-[0.85] text-gray-900 font-serif-luxury"
            >
              Transforme talento em um <br/>
              <span className="text-transparent bg-clip-text bg-linear-to-r from-purple-600 via-pink-500 to-amber-500 italic font-light">império digital.</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="text-xl text-gray-500 max-w-xl mx-auto lg:mx-0 leading-relaxed font-medium"
            >
              A agenda de luxo que automatiza seu salão, elimina o vácuo no WhatsApp e coloca dinheiro no seu bolso antes mesmo do atendimento.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-5 justify-center lg:justify-start"
            >
              <Link href="/admin/login" className="bg-purple-600 text-white text-lg font-black px-12 py-6 rounded-[2rem] shadow-2xl hover:bg-purple-700 transition transform hover:-translate-y-2 flex items-center justify-center gap-4 group">
                Criar Minha Agenda <FaArrowRight className="group-hover:translate-x-2 transition-transform"/>
              </Link>
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1 }}
            className="relative flex justify-center items-center"
          >
             <CalendarMockup />
             <FloatingBadge className="top-0 -left-10" style={{ animationDuration: '3s' }}>
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg"><FaWhatsapp/></div>
                <div><p className="text-[8px] font-black uppercase text-gray-400">Novo Agendamento</p><p className="text-xs font-bold">R$ 350,00 Pago</p></div>
             </FloatingBadge>
             <FloatingBadge className="bottom-20 -right-12">
                <div className="w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center text-white shadow-lg"><FaCrown/></div>
                <div><p className="text-[8px] font-black uppercase text-gray-400">Status</p><p className="text-xs font-bold">Plano PRO Ativo</p></div>
             </FloatingBadge>
          </motion.div>
        </div>
      </header>

      {/* SECTION: BENTO GRID VITRINE */}
      <section className="py-40 bg-white">
        <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-8">
                
                <div className="md:col-span-2 md:row-span-2 bg-gray-900 rounded-[4rem] p-12 text-white relative overflow-hidden group shadow-2xl">
                    <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:opacity-20 transition-all duration-700 group-hover:scale-110">
                        <FaMoneyBillWave size={300}/>
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-between">
                        <div className="space-y-6">
                            <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center text-green-400 text-2xl shadow-inner"><FaChartLine/></div>
                            <h3 className="text-5xl font-black tracking-tighter leading-none">Domine suas <br/>Finanças.</h3>
                            <p className="text-gray-400 text-lg font-medium max-w-sm">Gráficos de faturamento e lucros na palma da mão.</p>
                        </div>
                        <div className="mt-12 flex items-end gap-3 h-48">
                            {[40, 70, 45, 90, 65, 100, 80].map((h, i) => (
                                <motion.div 
                                    key={i} initial={{ height: 0 }} whileInView={{ height: `${h}%` }}
                                    className="flex-1 bg-linear-to-t from-purple-600 to-pink-500 rounded-t-xl opacity-80"
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 bg-[#fdfaf9] rounded-[4rem] p-12 border border-purple-50 flex flex-col justify-between group shadow-xl">
                    <div className="flex justify-between items-start">
                        <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 text-2xl shadow-sm"><FaMagic/></div>
                        <div className="bg-green-50 text-green-600 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Online Agora</div>
                    </div>
                    <div>
                        <h3 className="text-3xl font-black text-gray-900 tracking-tighter mb-2">Sua Página de Estrela</h3>
                        <p className="text-gray-500 font-medium italic">beautypro.com/seu-salao</p>
                    </div>
                </div>

                <div className="bg-linear-to-br from-purple-600 to-pink-600 rounded-[4rem] p-10 text-white flex flex-col justify-between shadow-2xl">
                    <FaGem size={40} className="text-purple-200 animate-pulse"/>
                    <h3 className="text-2xl font-black tracking-tight">Fidelidade Automática</h3>
                </div>

                <div className="bg-white rounded-[4rem] p-10 border border-purple-50 flex flex-col justify-between shadow-xl">
                    <div className="flex -space-x-3">
                        {[1,2,3].map(i => <div key={i} className="w-10 h-10 rounded-full bg-purple-100 border-2 border-white flex items-center justify-center text-purple-600 font-black text-xs">{i}</div>)}
                    </div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Suporte VIP</h3>
                </div>
            </div>
        </div>
      </section>

      {/* SECTION: PRICING */}
      <section id="planos" className="py-40 bg-[#fdfaf9]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-24 space-y-6">
            <span className="text-purple-600 font-black text-[11px] uppercase tracking-[0.5em]">Investimento</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-tighter text-gray-900 font-serif-luxury italic">Comece a brilhar</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
            <motion.div whileHover={{ y: -10 }} className="bg-white rounded-[4rem] p-12 border border-purple-50 flex flex-col shadow-2xl shadow-purple-900/5">
                <div className="mb-10">
                    <h3 className="text-2xl font-black text-gray-900 mb-6 uppercase tracking-widest text-[11px] text-purple-600">Plano Start</h3>
                    <div className="flex items-baseline gap-2">
                        <span className="text-gray-400 text-sm font-bold uppercase tracking-widest">R$</span>
                        <span className="text-7xl font-black text-gray-900 tracking-tighter">29</span>
                        <span className="text-gray-400 font-bold">,90/mês</span>
                    </div>
                    <p className="text-green-500 font-black text-[10px] uppercase tracking-widest mt-4 flex items-center gap-2"><FaCheckCircle/> 7 Dias Grátis</p>
                </div>
                <ul className="space-y-5 mb-12 flex-1">
                    {["Agenda Inteligente 24h", "Checkout com Pix", "Link Personalizado", "Cartão Fidelidade", "Relatórios Financeiros", "Suporte Humanizado"].map((f, i) => (
                        <li key={i} className="flex items-center gap-4 text-sm font-bold text-gray-600">
                            <div className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center text-purple-600"><FaCheck size={8}/></div> {f}
                        </li>
                    ))}
                </ul>
                <Link href="/admin/login" className="w-full py-6 rounded-[2rem] bg-gray-900 text-white font-black uppercase tracking-widest text-xs text-center hover:bg-purple-600 transition shadow-xl active:scale-95">Experimentar Grátis</Link>
            </motion.div>

            <motion.div whileHover={{ y: -10 }} className="bg-gray-900 rounded-[4rem] p-12 text-white flex flex-col relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 bg-linear-to-bl from-purple-500 to-pink-500 text-white text-[9px] font-black px-6 py-2 rounded-bl-3xl uppercase tracking-widest shadow-lg">Mais Solicitado</div>
                <div className="mb-10">
                    <h3 className="text-2xl font-black mb-6 uppercase tracking-widest text-[11px] text-purple-400">Setup VIP</h3>
                    <div className="flex items-baseline gap-2">
                        <span className="text-gray-500 text-sm font-bold uppercase tracking-widest">R$</span>
                        <span className="text-7xl font-black tracking-tighter text-white">199</span>
                        <span className="text-gray-500 font-bold">,00</span>
                    </div>
                    <p className="text-purple-400 font-black text-[10px] uppercase tracking-widest mt-4">Pagamento Único</p>
                </div>
                <ul className="space-y-5 mb-12 flex-1">
                    {["Nós configuramos TUDO para você", "Cadastro de todos os serviços", "Design personalizado da página", "Treinamento individual por vídeo", "Estratégia para captar clientes", "Pronto em até 24 horas"].map((f, i) => (
                        <li key={i} className="flex items-center gap-4 text-sm font-bold text-gray-400">
                            <div className="w-5 h-5 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400"><FaCrown size={8}/></div> {f}
                        </li>
                    ))}
                </ul>
                <Link href="https://wa.me/5579996337995" target="_blank" className="w-full py-6 rounded-[2rem] bg-linear-to-r from-purple-600 to-pink-600 text-white font-black uppercase tracking-widest text-xs text-center shadow-2xl flex items-center justify-center gap-3">
                    <FaWhatsapp size={18}/> Quero Setup VIP
                </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="py-40 px-6 max-w-4xl mx-auto">
          <h2 className="text-5xl font-black tracking-tighter text-gray-900 text-center mb-24">FAQ</h2>
          <div className="bg-white rounded-[3.5rem] p-10 md:p-16 border border-purple-50 shadow-xl shadow-purple-900/5">
              <FaqItem question="O sistema gera QR Code para pagamento?" answer="Sim! No plano PRO você cadastra sua chave Pix e o sistema gera automaticamente o QR Code para sua cliente pagar no ato do agendamento." />
              <FaqItem question="Funciona no celular?" answer="Sim! O BeautyPro é um sistema web inteligente que funciona direto no navegador do seu celular ou PC, sem ocupar espaço." />
              <FaqItem question="Como funciona o teste grátis?" answer="Você tem 7 dias para usar todas as funcionalidades. Se não gostar, basta não assinar." />
          </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-purple-50 py-20 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
            <div className="space-y-6 text-center md:text-left">
                <div className="flex items-center gap-2 text-2xl font-bold tracking-tighter justify-center md:justify-start">
                    <div className="bg-gray-100 p-2 rounded-xl text-gray-400"><FaMagic size={18}/></div>
                    <span className="text-gray-900 font-sans">BeautyPro</span>
                </div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.3em]">Ultimate Beauty Experience</p>
            </div>
            <div className="text-right">
                <p className="text-gray-400 text-[10px] font-bold">Aracaju, Sergipe • {new Date().getFullYear()}</p>
                <p className="text-gray-300 text-[9px] mt-1 italic">Feito para realçar seu talento.</p>
            </div>
        </div>
      </footer>

      {/* WHATSAPP FLOAT */}
      <a href="https://wa.me/5579996337995" target="_blank" className="fixed bottom-10 right-10 z-50 bg-green-500 text-white p-6 rounded-full shadow-[0_20px_50px_rgba(34,197,94,0.4)] transition hover:scale-110 group">
          <FaWhatsapp size={30} />
          <span className="absolute right-full mr-6 bg-gray-900 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none">Falar com Sábio</span>
      </a>
    </div>
  );
}