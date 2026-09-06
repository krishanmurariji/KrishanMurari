import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, Award, GraduationCap, CodeXml, ExternalLink } from 'lucide-react';

interface ResumeTabsProps {
  isLight?: boolean;
}

export default function ResumeTabs({ isLight }: ResumeTabsProps) {
  const [activeTab, setActiveTab] = useState<'experience' | 'certifications' | 'education'>('experience');

  const experienceData = [
    {
      role: 'Full Stack Developer (.NET + Angular)',
      company: 'Vineforce IT Services Pvt. Ltd.',
      period: 'April 2024 - Present',
      duration: '2 Years, 4 Months',
      durationShort: '2 Yr, 4 Mo',
      description: 'Working as a Full Stack Developer using Angular and ASP.NET Zero framework. Implemented features like payment integration with Stripe, identity and human verification systems, webhook creation, and CI/CD pipelines. Worked with Azure DevOps, MySQL, SSMS, and integrated tools like Zepto, SendGrid, PrimeNG, Syncfusion, Metronic, Postman, and Visual Studio Professional.',
      icon: CodeXml,
      skills: [
        { name: 'Angular', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/angularjs/angularjs-original.svg' },
        { name: 'ASP.NET', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dot-net/dot-net-original.svg' },
        { name: 'ASP.NET Zero', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dotnetcore/dotnetcore-original.svg' },
        { name: 'Azure DevOps', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/azure/azure-original.svg' },
        { name: 'MySQL', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg' },
        { name: 'SSMS', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/microsoftsqlserver/microsoftsqlserver-plain.svg' },
        { name: 'Stripe', icon: 'https://images.opencollective.com/stripe/f530f1e/logo/256.png' },
        { name: 'SendGrid', icon: 'https://www.vectorlogo.zone/logos/sendgrid/sendgrid-icon.svg' },
        { name: 'PrimeNG', icon: 'https://www.primefaces.org/wp-content/uploads/2016/10/prime_logo_new.png' },
        { name: 'Syncfusion', icon: 'https://cdn.syncfusion.com/content/images/company-logos/Syncfusion_Logo_Image.png' },
        { name: 'Bootstrap', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bootstrap/bootstrap-original.svg' },
        { name: 'JavaScript', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg' },
        { name: 'Postman', icon: 'https://www.vectorlogo.zone/logos/getpostman/getpostman-icon.svg' },
        { name: 'Visual Studio', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/visualstudio/visualstudio-plain.svg' }
      ]
    },
    {
      role: 'Python Developer Intern',
      company: 'Tech Internship Program',
      period: 'January 2024 - March 2024',
      duration: '3 Months',
      durationShort: '3 Mo',
      description: 'Worked on API creation, CRUD operations, and payment integration using Python and Django. Focused on backend logic, REST API structuring, and database handling.',
      icon: CodeXml,
      skills: [
        { name: 'Python', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg' },
        { name: 'Django', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/django/django-plain.svg' },
        { name: 'MySQL', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg' }
      ]
    },
    {
      role: 'Machine Learning Intern',
      company: 'AI Research Internship',
      period: 'June 2023 - December 2023',
      duration: '7 Months',
      durationShort: '7 Mo',
      description: 'Trained predictive ML models using Random Forest and Linear Regression for future output predictions. Gained experience in data preprocessing, visualization, and model evaluation using Python libraries like Pandas, NumPy, Scikit-learn, TensorFlow, and PyTorch.',
      icon: CodeXml,
      skills: [
        { name: 'Jupyter', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/jupyter/jupyter-original.svg' },
        { name: 'Pandas', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/pandas/pandas-original.svg' },
        { name: 'NumPy', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/numpy/numpy-original.svg' },
        { name: 'Scikit-learn', icon: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Scikit_learn_logo_small.svg' },
        { name: 'TensorFlow', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tensorflow/tensorflow-original.svg' },
        { name: 'PyTorch', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/pytorch/pytorch-original.svg' },
        { name: 'Matplotlib', icon: 'https://upload.wikimedia.org/wikipedia/commons/8/84/Matplotlib_icon.svg' }
      ]
    },
    {
      role: 'Android Development Intern',
      company: 'Mobile App Internship Program',
      period: 'May 2023 - June 2023',
      duration: '2 Months',
      durationShort: '2 Mo',
      description: 'Developed a basic Instagram clone using Java and Kotlin with Firebase integration. Implemented authentication, post creation, likes/dislikes, and image upload functionality in Android Studio.',
      icon: CodeXml,
      skills: [
        { name: 'Java', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg' },
        { name: 'Kotlin', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kotlin/kotlin-original.svg' },
        { name: 'Firebase', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/firebase/firebase-plain.svg' },
        { name: 'Android Studio', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/android/android-original.svg' }
      ]
    }
  ];

  const certificationsData = [
    {
      title: 'Microsoft Certified: Azure Fundamentals (AZ-900)',
      issuer: 'Microsoft',
      period: 'April 2024',
      duration: 'Credential ID: AZ-900',
      durationShort: 'AZ-900',
      description: 'Validates foundational knowledge of cloud services and how those services are provided with Microsoft Azure, including cloud concepts, core Azure services, security, privacy, compliance, and trust.',
      icon: Award,
      skills: [
        { name: 'Azure', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/azure/azure-original.svg' }
      ]
    },
    {
      title: 'Advanced Angular Developer Certification',
      issuer: 'Coursera / Google Developer Training',
      period: 'February 2024',
      duration: 'Verified Specialist',
      durationShort: 'Specialist',
      description: 'Advanced-level credential in Angular enterprise architectures, reactive state management using RxJS, custom directives, custom route guards, server-side rendering, and bundle size optimizations.',
      icon: Award,
      skills: [
        { name: 'Angular', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/angularjs/angularjs-original.svg' },
        { name: 'JavaScript', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg' }
      ]
    },
    {
      title: 'Django & Python Web Development',
      issuer: 'Udemy Academic Program',
      period: 'January 2024',
      duration: 'DRF Certificate',
      durationShort: 'Django',
      description: 'Comprehensive certification covering Model-View-Controller design patterns, Django REST Framework, database migrations, custom authentications, and REST API deployment strategies.',
      icon: Award,
      skills: [
        { name: 'Python', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg' },
        { name: 'Django', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/django/django-plain.svg' }
      ]
    },
    {
      title: 'Android App Development with Kotlin',
      issuer: 'Google Developer Training',
      period: 'July 2023',
      duration: 'Kotlin Specialist',
      durationShort: 'Kotlin',
      description: 'Acquired proficiency in building responsive, modern native Android applications using Kotlin, Jetpack libraries, Material Design guidelines, local databases, and live cloud synchronization.',
      icon: Award,
      skills: [
        { name: 'Kotlin', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kotlin/kotlin-original.svg' },
        { name: 'Android Studio', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/android/android-original.svg' },
        { name: 'Firebase', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/firebase/firebase-plain.svg' }
      ]
    }
  ];

  const educationData = [
    {
      degree: 'Bachelor of Technology (B.Tech) in Computer Science & Engineering',
      institution: 'Technical University',
      period: '2020 - 2024',
      duration: '4 Years Program',
      durationShort: '4 Yrs',
      description: 'Specialization in Software Engineering, Web Technologies, and Data Science. Core coursework included Data Structures & Algorithms, Object-Oriented Analysis & Design, Database Management Systems, Compiler Design, and Artificial Intelligence.',
      icon: GraduationCap,
      skills: [
        { name: 'Java', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg' },
        { name: 'Python', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg' },
        { name: 'JavaScript', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg' }
      ]
    },
    {
      degree: 'Senior Secondary School (XII - Physics, Chemistry, Math)',
      institution: 'Central Board of Secondary Education (CBSE)',
      period: '2019 - 2020',
      duration: 'High School',
      durationShort: 'High School',
      description: 'Completed upper secondary school with a focus on Mathematics, Physics, Chemistry, and Computer Science. Participated in national-level student coding challenges.',
      icon: GraduationCap,
      skills: [
        { name: 'Visual Studio', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/visualstudio/visualstudio-plain.svg' }
      ]
    }
  ];

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
      {/* Dynamic Metallic Frame Container */}
      <div className={`relative border-2 rounded-3xl p-4 sm:p-6 lg:p-12 mt-8 sm:mt-12 transition-all duration-500 backdrop-blur-2xl ${
        isLight 
          ? 'bg-white/45 border-black/15 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_10px_30px_rgba(0,0,0,0.05)]' 
          : 'bg-[#ffffff03] border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_15px_40px_rgba(0,0,0,0.4)]'
      }`}>
        
        {/* Floating Top Nav Tabs */}
        <div className="absolute -top-6 left-0 w-full flex flex-row justify-center gap-3 sm:gap-4 px-6">
          
          {/* Experience Tab Button */}
          <button
            onClick={() => setActiveTab('experience')}
            className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 border-2 rounded-full cursor-pointer hover:scale-105 transition-all shadow-md font-semibold text-sm sm:text-base ${
              activeTab === 'experience'
                ? (isLight ? 'border-black bg-white text-black' : 'border-white bg-[#111] text-white')
                : (isLight ? 'border-black/10 bg-white/60 text-black/50 hover:text-black hover:border-black/25' : 'border-white/10 bg-white/5 text-white/50 hover:text-white hover:border-white/20')
            }`}
          >
            <Briefcase className={`w-4 h-4 sm:w-5 h-5 ${activeTab === 'experience' ? (isLight ? 'text-black' : 'text-white') : 'text-current'}`} />
            <span>Experience</span>
          </button>

          {/* Certifications Tab Button */}
          <button
            onClick={() => setActiveTab('certifications')}
            className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 border-2 rounded-full cursor-pointer hover:scale-105 transition-all shadow-md font-semibold text-sm sm:text-base ${
              activeTab === 'certifications'
                ? (isLight ? 'border-black bg-white text-black' : 'border-white bg-[#111] text-white')
                : (isLight ? 'border-black/10 bg-white/60 text-black/50 hover:text-black hover:border-black/25' : 'border-white/10 bg-white/5 text-white/50 hover:text-white hover:border-white/20')
            }`}
          >
            <Award className={`w-4 h-4 sm:w-5 h-5 ${activeTab === 'certifications' ? (isLight ? 'text-black' : 'text-white') : 'text-current'}`} />
            <span>Certifications</span>
          </button>

          {/* Education Tab Button */}
          <button
            onClick={() => setActiveTab('education')}
            className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2 border-2 rounded-full cursor-pointer hover:scale-105 transition-all shadow-md font-semibold text-sm sm:text-base ${
              activeTab === 'education'
                ? (isLight ? 'border-black bg-white text-black' : 'border-white bg-[#111] text-white')
                : (isLight ? 'border-black/10 bg-white/60 text-black/50 hover:text-black hover:border-black/25' : 'border-white/10 bg-white/5 text-white/50 hover:text-white hover:border-white/20')
            }`}
          >
            <GraduationCap className={`w-4 h-4 sm:w-5 h-5 ${activeTab === 'education' ? (isLight ? 'text-black' : 'text-white') : 'text-current'}`} />
            <span>Education</span>
          </button>

        </div>

        {/* Content Container */}
        <div className="relative mt-8 md:mt-12">
          {/* Timeline Vertical Line (Desktop only) */}
          <div className={`absolute left-4 sm:left-8 top-0 bottom-0 w-[1px] hidden md:block ${
            isLight ? 'bg-gradient-to-b from-black/20 via-black/15 to-transparent' : 'bg-gradient-to-b from-white/20 via-white/10 to-transparent'
          }`} />

          <div className="space-y-8 sm:space-y-12 lg:space-y-16">
            <AnimatePresence mode="wait">
              {activeTab === 'experience' && (
                <motion.div
                  key="experience-tab"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-8 sm:space-y-12 lg:space-y-16"
                >
                  {experienceData.map((exp, idx) => (
                    <div key={idx} className="relative md:pl-20">
                      {/* Left timeline circle icon (Desktop only) */}
                      <div className={`absolute left-4 top-6 w-8 h-8 rounded-full flex items-center justify-center hidden md:flex border ${
                        isLight ? 'bg-white border-black/10 shadow-[0_3px_10px_rgba(0,0,0,0.05)] text-black' : 'bg-[#111] border-white/10 text-white'
                      }`}>
                        <Briefcase className="w-4 h-4" />
                      </div>

                      {/* Info Card */}
                      <div className={`border rounded-2xl p-5 sm:p-6 lg:p-8 pt-10 sm:pt-10 pb-16 sm:pb-16 relative transition-all duration-300 hover:shadow-xl ${
                        isLight 
                          ? 'bg-white/40 border-black/10 hover:border-black/25 hover:bg-white/60' 
                          : 'bg-[#ffffff02] border-white/10 hover:border-white/20 hover:bg-white/5'
                      }`}>
                        
                        {/* Period Tag */}
                        <div className={`absolute -top-3 left-4 sm:left-6 px-3 sm:px-4 py-1 border rounded-lg text-xs font-semibold ${
                          isLight ? 'bg-white border-black/10 text-black/80 shadow-sm' : 'bg-zinc-900 border-white/10 text-white/80'
                        }`}>
                          {exp.period}
                        </div>

                        {/* Duration Tag */}
                        <div className="absolute -top-3 right-4 sm:right-6">
                          <div className={`px-3 sm:px-4 py-1 border rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                            isLight ? 'bg-black border-black text-white' : 'bg-white border-white text-black'
                          }`}>
                            <Award className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{exp.duration}</span>
                            <span className="sm:hidden">{exp.durationShort}</span>
                          </div>
                        </div>

                        {/* Job Title and Company */}
                        <div className="flex items-center gap-4 mb-4 mt-2">
                          <div className="circular-loader-container shrink-0">
                            <div className="loader-circle">
                              <svg viewBox="0 0 80 80">
                                <circle 
                                  r="32" 
                                  cy="40" 
                                  cx="40" 
                                  id="circle-path"
                                  className="stroke-black/30 dark:stroke-white/30"
                                  style={{
                                    strokeDasharray: '200',
                                    strokeDashoffset: '140',
                                    strokeWidth: '4',
                                    fill: 'none'
                                  }}
                                />
                              </svg>
                            </div>
                            <div className={`briefcase-icon-center flex items-center justify-center ${isLight ? 'text-black' : 'text-white'}`}>
                              <exp.icon className="w-5 h-5" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold leading-tight tracking-tight">{exp.role}</h3>
                            <p className={`text-sm sm:text-base font-semibold ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`}>{exp.company}</p>
                          </div>
                        </div>

                        {/* Description */}
                        <p className={`text-sm sm:text-base leading-relaxed text-justify mb-4 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                          {exp.description}
                        </p>

                        {/* Skills Icons */}
                        <div className="absolute -bottom-4 sm:-bottom-5 left-0 right-0 flex justify-center px-4 pointer-events-none">
                          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 max-w-full">
                            {exp.skills.map((skill, sIdx) => (
                              <div 
                                key={sIdx} 
                                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center hover:scale-125 transition-all shadow-sm shrink-0 group relative pointer-events-auto cursor-pointer ${
                                  isLight ? 'bg-white border-black/10' : 'bg-[#111] border-white/10'
                                }`}
                              >
                                <img src={skill.icon} alt={skill.name} className="w-5 h-5 sm:w-6 h-6 object-contain" />
                                <div className={`absolute -top-10 left-1/2 transform -translate-x-1/2 px-2.5 py-1 border rounded-lg text-[10px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg ${
                                  isLight ? 'bg-white border-black/15 text-black' : 'bg-black border-white/15 text-white'
                                }`}>
                                  {skill.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {activeTab === 'certifications' && (
                <motion.div
                  key="certifications-tab"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-8 sm:space-y-12 lg:space-y-16"
                >
                  {certificationsData.map((cert, idx) => (
                    <div key={idx} className="relative md:pl-20">
                      {/* Left timeline circle icon (Desktop only) */}
                      <div className={`absolute left-4 top-6 w-8 h-8 rounded-full flex items-center justify-center hidden md:flex border ${
                        isLight ? 'bg-white border-black/10 shadow-[0_3px_10px_rgba(0,0,0,0.05)] text-black' : 'bg-[#111] border-white/10 text-white'
                      }`}>
                        <Award className="w-4 h-4" />
                      </div>

                      {/* Info Card */}
                      <div className={`border rounded-2xl p-5 sm:p-6 lg:p-8 pt-10 sm:pt-10 pb-16 sm:pb-16 relative transition-all duration-300 hover:shadow-xl ${
                        isLight 
                          ? 'bg-white/40 border-black/10 hover:border-black/25 hover:bg-white/60' 
                          : 'bg-[#ffffff02] border-white/10 hover:border-white/20 hover:bg-white/5'
                      }`}>
                        
                        {/* Period Tag */}
                        <div className={`absolute -top-3 left-4 sm:left-6 px-3 sm:px-4 py-1 border rounded-lg text-xs font-semibold ${
                          isLight ? 'bg-white border-black/10 text-black/80 shadow-sm' : 'bg-zinc-900 border-white/10 text-white/80'
                        }`}>
                          {cert.period}
                        </div>

                        {/* ID/Tag */}
                        <div className="absolute -top-3 right-4 sm:right-6">
                          <div className={`px-3 sm:px-4 py-1 border rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                            isLight ? 'bg-black border-black text-white' : 'bg-white border-white text-black'
                          }`}>
                            <Award className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{cert.duration}</span>
                            <span className="sm:hidden">{cert.durationShort}</span>
                          </div>
                        </div>

                        {/* Title & Issuer */}
                        <div className="flex items-center gap-4 mb-4 mt-2">
                          <div className="circular-loader-container shrink-0">
                            <div className="loader-circle">
                              <svg viewBox="0 0 80 80">
                                <circle 
                                  r="32" 
                                  cy="40" 
                                  cx="40" 
                                  id="circle-path"
                                  className="stroke-black/30 dark:stroke-white/30"
                                  style={{
                                    strokeDasharray: '200',
                                    strokeDashoffset: '140',
                                    strokeWidth: '4',
                                    fill: 'none'
                                  }}
                                />
                              </svg>
                            </div>
                            <div className={`briefcase-icon-center flex items-center justify-center ${isLight ? 'text-black' : 'text-white'}`}>
                              <cert.icon className="w-5 h-5" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold leading-tight tracking-tight">{cert.title}</h3>
                            <p className={`text-sm sm:text-base font-semibold ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`}>{cert.issuer}</p>
                          </div>
                        </div>

                        {/* Description */}
                        <p className={`text-sm sm:text-base leading-relaxed text-justify mb-4 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                          {cert.description}
                        </p>

                        {/* Tech Logo Badges */}
                        <div className="absolute -bottom-4 sm:-bottom-5 left-0 right-0 flex justify-center px-4 pointer-events-none">
                          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 max-w-full">
                            {cert.skills.map((skill, sIdx) => (
                              <div 
                                key={sIdx} 
                                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center hover:scale-125 transition-all shadow-sm shrink-0 group relative pointer-events-auto cursor-pointer ${
                                  isLight ? 'bg-white border-black/10' : 'bg-[#111] border-white/10'
                                }`}
                              >
                                <img src={skill.icon} alt={skill.name} className="w-5 h-5 sm:w-6 h-6 object-contain" />
                                <div className={`absolute -top-10 left-1/2 transform -translate-x-1/2 px-2.5 py-1 border rounded-lg text-[10px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg ${
                                  isLight ? 'bg-white border-black/15 text-black' : 'bg-black border-white/15 text-white'
                                }`}>
                                  {skill.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {activeTab === 'education' && (
                <motion.div
                  key="education-tab"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-8 sm:space-y-12 lg:space-y-16"
                >
                  {educationData.map((edu, idx) => (
                    <div key={idx} className="relative md:pl-20">
                      {/* Left timeline circle icon (Desktop only) */}
                      <div className={`absolute left-4 top-6 w-8 h-8 rounded-full flex items-center justify-center hidden md:flex border ${
                        isLight ? 'bg-white border-black/10 shadow-[0_3px_10px_rgba(0,0,0,0.05)] text-black' : 'bg-[#111] border-white/10 text-white'
                      }`}>
                        <GraduationCap className="w-4 h-4" />
                      </div>

                      {/* Info Card */}
                      <div className={`border rounded-2xl p-5 sm:p-6 lg:p-8 pt-10 sm:pt-10 pb-16 sm:pb-16 relative transition-all duration-300 hover:shadow-xl ${
                        isLight 
                          ? 'bg-white/40 border-black/10 hover:border-black/25 hover:bg-white/60' 
                          : 'bg-[#ffffff02] border-white/10 hover:border-white/20 hover:bg-white/5'
                      }`}>
                        
                        {/* Period Tag */}
                        <div className={`absolute -top-3 left-4 sm:left-6 px-3 sm:px-4 py-1 border rounded-lg text-xs font-semibold ${
                          isLight ? 'bg-white border-black/10 text-black/80 shadow-sm' : 'bg-zinc-900 border-white/10 text-white/80'
                        }`}>
                          {edu.period}
                        </div>

                        {/* Duration Tag */}
                        <div className="absolute -top-3 right-4 sm:right-6">
                          <div className={`px-3 sm:px-4 py-1 border rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                            isLight ? 'bg-black border-black text-white' : 'bg-white border-white text-black'
                          }`}>
                            <GraduationCap className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{edu.duration}</span>
                            <span className="sm:hidden">{edu.durationShort}</span>
                          </div>
                        </div>

                        {/* Degree & Institution */}
                        <div className="flex items-center gap-4 mb-4 mt-2">
                          <div className="circular-loader-container shrink-0">
                            <div className="loader-circle">
                              <svg viewBox="0 0 80 80">
                                <circle 
                                  r="32" 
                                  cy="40" 
                                  cx="40" 
                                  id="circle-path"
                                  className="stroke-black/30 dark:stroke-white/30"
                                  style={{
                                    strokeDasharray: '200',
                                    strokeDashoffset: '140',
                                    strokeWidth: '4',
                                    fill: 'none'
                                  }}
                                />
                              </svg>
                            </div>
                            <div className={`briefcase-icon-center flex items-center justify-center ${isLight ? 'text-black' : 'text-white'}`}>
                              <edu.icon className="w-5 h-5" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold leading-tight tracking-tight">{edu.degree}</h3>
                            <p className={`text-sm sm:text-base font-semibold ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`}>{edu.institution}</p>
                          </div>
                        </div>

                        {/* Description */}
                        <p className={`text-sm sm:text-base leading-relaxed text-justify mb-4 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                          {edu.description}
                        </p>

                        {/* Tech Logo Badges */}
                        <div className="absolute -bottom-4 sm:-bottom-5 left-0 right-0 flex justify-center px-4 pointer-events-none">
                          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 max-w-full">
                            {edu.skills.map((skill, sIdx) => (
                              <div 
                                key={sIdx} 
                                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center hover:scale-125 transition-all shadow-sm shrink-0 group relative pointer-events-auto cursor-pointer ${
                                  isLight ? 'bg-white border-black/10' : 'bg-[#111] border-white/10'
                                }`}
                              >
                                <img src={skill.icon} alt={skill.name} className="w-5 h-5 sm:w-6 h-6 object-contain" />
                                <div className={`absolute -top-10 left-1/2 transform -translate-x-1/2 px-2.5 py-1 border rounded-lg text-[10px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg ${
                                  isLight ? 'bg-white border-black/15 text-black' : 'bg-black border-white/15 text-white'
                                }`}>
                                  {skill.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}
