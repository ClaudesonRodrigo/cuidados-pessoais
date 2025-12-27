// src/app/page.tsx
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { 
  FaCut, FaCalendarAlt, FaWhatsapp, FaCheck, FaRocket, FaMobileAlt, 
  FaMoneyBillWave, FaArrowRight, FaStar, FaQuestionCircle, FaChevronDown, FaLock, FaBolt, FaUserTie
} from 'react-icons/fa';

// --- COMPONENTES VISUAIS (MOCKUPS CSS) ---

// 1. Notificação de Agendamento (Para o Hero)
const NotificationMockup = () => (
  <motion.div 
    initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5 }}
    className="absolute top-10 right-0 md:-right-10 bg-gray-800/90 backdrop-blur border border-gray-700 p-4 rounded-xl shadow-2xl flex gap-3 items-center w-64 z-20"
  >
    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white"><FaWhatsapp/></div>
    <div>
      <p className="text-xs text-gray-400">Novo Agendamento</p>
      <p className="text-sm font-bold text-white">R$ 50,00 - Pago via Pix</p>
    </div>
  </motion.div>
);

// 2. Card de Calendário (Para o Hero)
const CalendarMockup = () => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 w-full max-w-sm shadow-2xl relative overflow-hidden">
     <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
         <span className="text-sm font-bold text-gray-300">Dezembro</span>
         <FaCalendarAlt className="text-orange-500"/>
     </div>
     <div className="space-y-2">
         {[1,2,3].map(i => (
             <div key={i} className="flex gap-2 items-center">
                 <div className="text-xs text-gray-500 w-10">1{i}:00</div>
                 <div className={`h-8 rounded-lg flex-1 flex items-center px-3 text-xs font-bold ${i===2 ? 'bg-gray-800 border border-dashed border-gray-700 text-gray-500' : 'bg-orange-600/20 text-orange-400 border border-orange-500/20'}`}>
                     {i===2 ? 'Disponível' : 'João Silva - Corte + Barba'}
                 </div>
             </div>
         ))}
     </div>
     <NotificationMockup />
  </div>
);

// 3. Accordion FAQ
const FaqItem = ({ question, answer }: { question: string, answer: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border-b border-gray-800">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full py-4 flex justify-between items-center text-left hover:text-orange-400 transition">
                <span className="font-bold text-lg">{question}</span>
                <FaChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}/>
            </button>
            <motion.div initial={false} animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }} className="overflow-hidden">
                <p className="pb-4 text-gray-400">{answer}</p>
            </motion.div>
        </div>
    )
}

export default function Home() {
  
  const steps = [
    {
      icon: <FaMobileAlt className="text-3xl text-blue-400"/>,
      title: "1. Cliente Acessa",
      desc: "Ele clica no seu link (bio do Insta ou Zap) e vê seus horários livres."
    },
    {
      icon: <FaCalendarAlt className="text-3xl text-orange-400"/>,
      title: "2. Escolhe e Agenda",
      desc: "Seleciona o serviço. O sistema calcula o tempo e o valor na hora."
    },
    {
      icon: <FaCheck className="text-3xl text-green-400"/>,
      title: "3. Tudo Pronto",
      desc: "Você recebe a notificação já com o Pix confirmado (opcional)."
    }
  ];

  const plans = [
    {
      name: "Barber Start",
      price: "29,90",
      period: "/mês",
      features: [
        "7 Dias de Teste Grátis",
        "Agenda 100% Automática", 
        "Validação de Pix (Copia e Cola)", 
        "Link Personalizado (seu-nome)",
        "Relatórios de Faturamento",
        "Suporte Humanizado"
      ],
      cta: "Testar Grátis Agora",
      highlight: true,
      link: "/admin/login",
      subtext: "Cancele quando quiser."
    },
    {
      name: "Setup VIP (Instalação)",
      price: "199,00",
      period: "pagamento único",
      features: [
        "Nós configuramos TUDO pra você",
        "Cadastro de todos os serviços",
        "Personalização da identidade visual",
        "Treinamento exclusivo (Call)",
        "Configuração de Horários e Feriados",
        "Entrega em até 24h"
      ],
      cta: "Quero Configuração VIP",
      highlight: false,
      link: "https://wa.me/5579996337995?text=Ola,%20quero%20contratar%20o%20Setup%20VIP%20de%20R$%20199,00",
      subtext: "+ Assinatura mensal de R$ 29,90"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-orange-500 selection:text-white">
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-2 text-2xl font-bold tracking-tighter cursor-pointer">
            <div className="bg-linear-to-br from-orange-500 to-red-600 text-white p-1.5 rounded-lg"><FaCut size={20}/></div>
            <span>Barber<span className="text-orange-500">Pro</span></span>
          </div>
          <div className="flex gap-4">
            <Link href="/admin/login" className="text-sm font-bold text-gray-300 hover:text-white transition py-2">
              Login
            </Link>
            <Link href="/admin/login" className="hidden sm:flex items-center gap-2 bg-white text-gray-900 px-5 py-2 rounded-full text-sm font-bold hover:bg-gray-200 transition shadow-lg shadow-white/10">
              <FaRocket className="text-orange-600"/> Começar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-orange-600/10 rounded-full blur-[120px] -z-10" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] -z-10" />

        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          
          {/* Texto Hero */}
          <div className="space-y-8 text-center md:text-left">
            <motion.div 
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-900 border border-gray-700 text-orange-400 text-xs font-bold uppercase tracking-wider shadow-sm"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/> Sistema Online 24h
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-none"
            >
              Sua barbearia <br/>
              <span className="text-transparent bg-clip-text bg-linear-to-r from-orange-400 to-red-500">No Piloto Automático.</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg text-gray-400 max-w-lg mx-auto md:mx-0 leading-relaxed"
            >
              Abandone a agenda de papel e o WhatsApp lotado. Tenha um sistema profissional de agendamento, financeiro e fidelização.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 pt-2 justify-center md:justify-start"
            >
              <Link href="/admin/login" className="bg-orange-600 hover:bg-orange-700 text-white text-lg font-bold px-8 py-4 rounded-2xl shadow-xl shadow-orange-900/40 transition transform hover:-translate-y-1 flex items-center justify-center gap-3">
                Criar Minha Agenda <FaArrowRight />
              </Link>
              <Link href="#como-funciona" className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-lg font-bold px-8 py-4 rounded-2xl border border-gray-700 transition flex items-center justify-center gap-2">
                <FaBolt className="text-yellow-400"/> Ver Funcionalidades
              </Link>
            </motion.div>

            <div className="pt-6 flex items-center gap-4 text-sm text-gray-500 justify-center md:justify-start">
                <div className="flex -space-x-2">
                    {[1,2,3,4].map(i => <div key={i} className="w-8 h-8 rounded-full bg-gray-800 border-2 border-gray-950 flex items-center justify-center text-xs">🧔</div>)}
                </div>
                <p>+ de <strong className="text-white">500 barbearias</strong> cadastradas</p>
            </div>
          </div>

          {/* Visual Hero (Mockups) */}
          <motion.div 
             initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7 }}
             className="relative hidden md:flex justify-center items-center"
          >
             {/* Abstract Shapes */}
             <div className="absolute inset-0 bg-linear-to-tr from-orange-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse"/>
             <CalendarMockup />
          </motion.div>
        </div>
      </header>

      {/* SECTION: COMO FUNCIONA (TOUR) */}
      <section id="como-funciona" className="py-24 bg-gray-900 border-y border-gray-800 relative">
        <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
                <h2 className="text-3xl font-bold mb-4">Como funciona na prática?</h2>
                <p className="text-gray-400">Simplificamos tudo para você e para seu cliente.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
                {steps.map((step, i) => (
                    <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.2 }}
                        className="bg-gray-950 p-8 rounded-3xl border border-gray-800 relative group hover:border-orange-500/30 transition duration-500"
                    >
                        <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition shadow-inner">
                            {step.icon}
                        </div>
                        <h3 className="text-xl font-bold mb-3 text-white group-hover:text-orange-400 transition">{step.title}</h3>
                        <p className="text-gray-400 leading-relaxed">{step.desc}</p>
                        
                        {/* Conector Visual (Seta) */}
                        {i !== 2 && <div className="hidden md:block absolute top-1/2 -right-6 text-gray-700 text-2xl transform -translate-y-1/2">→</div>}
                    </motion.div>
                ))}
            </div>
        </div>
      </section>

      {/* SECTION: FERRAMENTAS (BENTO GRID) */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
                <span className="text-orange-500 font-bold uppercase tracking-widest text-xs">Funcionalidades</span>
                <h2 className="text-3xl md:text-5xl font-bold mt-2 mb-4">Tudo o que sua barbearia precisa</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-6">
                {/* Feature 1: Financeiro (Grande) */}
                <div className="md:col-span-2 row-span-2 bg-linear-to-br from-gray-900 to-gray-950 rounded-3xl p-8 border border-gray-800 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition transform group-hover:scale-110 duration-700">
                        <FaMoneyBillWave size={200}/>
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-between">
                        <div>
                            <div className="w-12 h-12 bg-green-900/50 rounded-xl flex items-center justify-center text-green-400 mb-4"><FaMoneyBillWave size={24}/></div>
                            <h3 className="text-3xl font-bold mb-2">Controle Financeiro</h3>
                            <p className="text-gray-400 text-lg">Saiba exatamente quanto você faturou no dia, na semana e no mês. Chega de caderninho.</p>
                        </div>
                        {/* Mini Graph Mockup */}
                        <div className="mt-8 flex items-end gap-2 h-32 w-full max-w-sm mx-auto opacity-80">
                            {[40, 60, 30, 80, 50, 90, 70].map((h, i) => (
                                <div key={i} style={{height: `${h}%`}} className="flex-1 bg-green-500/20 rounded-t-sm hover:bg-green-500 transition-all cursor-pointer relative group/bar">
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-xs px-2 py-1 rounded opacity-0 group-hover/bar:opacity-100 transition text-white">R${h}0</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Feature 2: Link Personalizado */}
                <div className="bg-gray-900 rounded-3xl p-8 border border-gray-800 hover:border-blue-500/50 transition duration-300">
                    <div className="w-12 h-12 bg-blue-900/50 rounded-xl flex items-center justify-center text-blue-400 mb-4"><FaRocket size={24}/></div>
                    <h3 className="text-xl font-bold mb-2">Seu Site Próprio</h3>
                    <p className="text-gray-400 text-sm">Um link profissional (ex: barberpro.com/sua-loja) para colocar na bio.</p>
                </div>

                {/* Feature 3: Cardápio */}
                <div className="bg-gray-900 rounded-3xl p-8 border border-gray-800 hover:border-purple-500/50 transition duration-300">
                    <div className="w-12 h-12 bg-purple-900/50 rounded-xl flex items-center justify-center text-purple-400 mb-4"><FaCut size={24}/></div>
                    <h3 className="text-xl font-bold mb-2">Cardápio Inteligente</h3>
                    <p className="text-gray-400 text-sm">O cliente escolhe "Cabelo + Barba" e o sistema soma o tempo automaticamente.</p>
                </div>
            </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="planos" className="py-24 bg-gray-950 relative border-t border-gray-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-orange-900/10 via-gray-950 to-gray-950" />
        
        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Preço justo. Sem pegadinhas.</h2>
            <p className="text-gray-400">Escolha fazer sozinho ou deixe que nossa equipe configura para você.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {plans.map((plan, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className={`p-1 rounded-3xl ${plan.highlight ? 'bg-linear-to-b from-orange-500 to-gray-900' : 'bg-gray-800'}`}
              >
                  <div className="bg-gray-950 h-full rounded-[22px] p-8 flex flex-col relative overflow-hidden">
                    {plan.highlight && (
                        <div className="absolute top-0 right-0 bg-orange-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                            Mais Popular
                        </div>
                    )}

                    <div className="mb-6">
                        <h3 className="text-xl font-bold text-gray-200">{plan.name}</h3>
                        <div className="flex items-baseline mt-4 gap-1">
                            <span className="text-sm text-gray-500">R$</span>
                            <span className="text-5xl font-extrabold text-white tracking-tighter">{plan.price}</span>
                            <span className="text-gray-500 font-medium">{plan.period}</span>
                        </div>
                        <p className="text-xs text-green-400 mt-2 font-bold flex items-center gap-1"><FaCheck/> {plan.subtext}</p>
                    </div>

                    <div className="w-full h-px bg-gray-800 mb-6"/>

                    <ul className="space-y-4 mb-8 flex-1">
                        {plan.features.map((feat, j) => (
                            <li key={j} className="flex items-start gap-3 text-sm text-gray-300">
                                <div className={`mt-1 p-1 rounded-full ${plan.highlight ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-800 text-gray-500'}`}><FaCheck size={8}/></div>
                                {feat}
                            </li>
                        ))}
                    </ul>

                    <Link 
                        href={plan.link}
                        target={i === 1 ? "_blank" : "_self"}
                        className={`w-full py-4 rounded-xl font-bold text-center transition flex items-center justify-center gap-2 ${plan.highlight ? 'bg-white text-gray-900 hover:bg-gray-200' : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'}`}
                    >
                        {i === 1 && <FaWhatsapp className="text-green-500"/>} {plan.cta}
                    </Link>
                  </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="py-24 px-6 max-w-3xl mx-auto">
          <div className="text-center mb-12">
              <FaQuestionCircle className="text-4xl text-gray-700 mx-auto mb-4"/>
              <h2 className="text-3xl font-bold">Dúvidas Frequentes</h2>
          </div>
          <div className="space-y-2">
              <FaqItem question="Preciso colocar cartão de crédito para testar?" answer="Não! Você cria sua conta e usa por 7 dias grátis. Se gostar, aí sim você assina." />
              <FaqItem question="Funciona no celular?" answer="Sim! O sistema é 100% otimizado para celular, tanto para você (dono) quanto para seu cliente." />
              <FaqItem question="Como funciona o pagamento via Pix?" answer="Você cadastra sua chave Pix no painel. O cliente copia o código e paga no banco dele. Simples e direto na sua conta." />
              <FaqItem question="E se eu quiser cancelar?" answer="Sem problemas. O plano é mensal, sem fidelidade. Você cancela quando quiser direto pelo painel." />
          </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 px-6 bg-linear-to-r from-orange-600 to-red-600 text-center">
          <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">Pronto para profissionalizar sua barbearia?</h2>
              <p className="text-orange-100 text-lg mb-8 max-w-2xl mx-auto">Junte-se a centenas de barbeiros que estão economizando tempo e ganhando mais dinheiro.</p>
              <Link href="/admin/login" className="bg-white text-orange-600 text-xl font-bold px-10 py-5 rounded-full shadow-2xl hover:bg-gray-100 transition inline-flex items-center gap-3 transform hover:scale-105">
                  <FaRocket/> Criar Conta Grátis
              </Link>
              <p className="mt-4 text-orange-200 text-sm font-bold">Teste de 7 dias • Cancele quando quiser</p>
          </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-950 border-t border-gray-900 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 text-xl font-bold text-gray-500">
                <FaCut/> BarberPro
            </div>
            <p className="text-gray-600 text-sm text-center md:text-right">
                &copy; {new Date().getFullYear()} BarberPro Sistema.<br/>Feito para barbeiros de verdade.
            </p>
        </div>
      </footer>

    </div>
  );
}