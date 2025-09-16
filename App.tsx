
import React, { useState, useEffect, useMemo } from 'react';
import type { Driver, Unit, Status, EmptyUnitInfo, DriverStatusInfo } from './types';
import { parseManpowerData } from './services/dataParser';

// --- Reusable UI Components ---

const StatusBadge: React.FC<{ status: Status }> = ({ status }) => {
    const statusStyles: { [key: string]: string } = {
        D: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        N: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300',
        CR: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        OFF: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
        I: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    };
    const defaultStyle = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    return (
        <span className={`px-3 py-1 text-xs font-semibold leading-5 rounded-full ${statusStyles[status] || defaultStyle}`}>
            {status}
        </span>
    );
};

interface DashboardCardProps {
    title: string;
    value: number | string;
    icon: JSX.Element;
    color: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, icon, color }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg flex items-center space-x-4 transition-transform hover:scale-105">
        <div className={`p-3 rounded-xl ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
    </div>
);


// --- Main Application Component ---

const App: React.FC = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [spareDrivers, setSpareDrivers] = useState<Driver[]>([]);
    const [selectedDay, setSelectedDay] = useState<number>(1);
    const [activeShift, setActiveShift] = useState<'day' | 'night'>('day');
    const [activeDetailTab, setActiveDetailTab] = useState<string>('on_duty');

    useEffect(() => {
        const parsedDrivers = parseManpowerData();
        setDrivers(parsedDrivers);

        const regularDrivers = parsedDrivers.filter(d => !d.unit.toUpperCase().includes('SPARE'));
        const currentSpareDrivers = parsedDrivers.filter(d => d.unit.toUpperCase().includes('SPARE'));
        setSpareDrivers(currentSpareDrivers);

        const unitsMap = new Map<string, Driver[]>();
        regularDrivers.forEach(driver => {
            const existing = unitsMap.get(driver.unit) || [];
            unitsMap.set(driver.unit, [...existing, driver]);
        });

        const unitsArray = Array.from(unitsMap.values())
            .filter(drivers => drivers.length > 0)
            .map(drivers => ({ name: drivers[0].unit, drivers }));
        
        setUnits(unitsArray);
    }, []);
    
    // Reset detail tab when switching shifts
    useEffect(() => {
        setActiveDetailTab('on_duty');
    }, [activeShift]);


    const dailyData = useMemo(() => {
        const dayIndex = selectedDay - 1;
        if (dayIndex < 0 || dayIndex > 30) return null;

        const onDutyDay: DriverStatusInfo[] = [];
        const onDutyNight: DriverStatusInfo[] = [];

        drivers.forEach(driver => {
            const status = driver.dailyStatuses[dayIndex];
            if (status === 'D') onDutyDay.push({ driver, shift: 'Day'});
            if (status === 'N') onDutyNight.push({ driver, shift: 'Night'});
        });
        
        const emptyUnitsDay: EmptyUnitInfo[] = [];
        const emptyUnitsNight: EmptyUnitInfo[] = [];
        const onRoosterDay: DriverStatusInfo[] = [];
        const onRoosterNight: DriverStatusInfo[] = [];
        const onOffDay: DriverStatusInfo[] = [];
        const onOffNight: DriverStatusInfo[] = [];
        const onInductionDay: DriverStatusInfo[] = [];
        const onInductionNight: DriverStatusInfo[] = [];

        units.forEach(unit => {
            if (unit.drivers.length >= 2) {
                const driver1 = unit.drivers[0];
                const driver2 = unit.drivers[1];
                const status1 = driver1.dailyStatuses[dayIndex];
                const status2 = driver2.dailyStatuses[dayIndex];

                const hasDayWorker = status1 === 'D' || status2 === 'D';
                const hasNightWorker = status1 === 'N' || status2 === 'N';

                if (!hasDayWorker) {
                    const absentDriver = status1 !== 'N' ? driver1 : driver2;
                    const absentStatus = status1 !== 'N' ? status1 : status2;
                    if (['CR', 'OFF', 'I'].includes(absentStatus)) {
                        emptyUnitsDay.push({ unitName: unit.name, shift: 'Day', absentDriver, status: absentStatus });
                    }
                }
                if (!hasNightWorker) {
                    const absentDriver = status1 !== 'D' ? driver1 : driver2;
                    const absentStatus = status1 !== 'D' ? status1 : status2;
                     if (['CR', 'OFF', 'I'].includes(absentStatus)) {
                        emptyUnitsNight.push({ unitName: unit.name, shift: 'Night', absentDriver, status: absentStatus });
                    }
                }
                
                const processAbsentee = (driver: Driver, status: Status, designatedShift: 'Day' | 'Night') => {
                    if (status === 'CR') (designatedShift === 'Day' ? onRoosterDay : onRoosterNight).push({driver, shift: designatedShift});
                    if (status === 'OFF') (designatedShift === 'Day' ? onOffDay : onOffNight).push({driver, shift: designatedShift});
                    if (status === 'I') (designatedShift === 'Day' ? onInductionDay : onInductionNight).push({driver, shift: designatedShift});
                };

                // Driver 1 is typically Day shift, Driver 2 Night shift unless swapped
                if (status1 !== 'D' && status1 !== 'N') processAbsentee(driver1, status1, 'Day');
                if (status2 !== 'D' && status2 !== 'N') processAbsentee(driver2, status2, 'Night');

            }
        });

        spareDrivers.forEach(driver => {
            const status = driver.dailyStatuses[dayIndex];
            if (status === 'CR') {
                // Since spare drivers aren't assigned a shift for leave, add them to both detail lists for visibility
                const spareInfo: DriverStatusInfo = { driver, shift: 'Spare' };
                onRoosterDay.push(spareInfo);
                onRoosterNight.push(spareInfo);
            }
        });
        
        // Calculate a single, accurate total count of drivers on leave for the dashboard card
        const totalOnRooster = drivers.filter(d => d.dailyStatuses[dayIndex] === 'CR').length;

        const availableSparesDay = spareDrivers.filter(d => d.dailyStatuses[dayIndex] === 'D').length;
        const availableSparesNight = spareDrivers.filter(d => d.dailyStatuses[dayIndex] === 'N').length;

        return {
           day: {
                onDuty: onDutyDay,
                emptyUnits: emptyUnitsDay,
                onRooster: onRoosterDay,
                onOff: onOffDay,
                onInduction: onInductionDay,
                stats: {
                    onDutyCount: onDutyDay.length,
                    emptyCount: emptyUnitsDay.length,
                    roosterCount: totalOnRooster,
                    availableSpares: availableSparesDay
                }
           },
           night: {
                onDuty: onDutyNight,
                emptyUnits: emptyUnitsNight,
                onRooster: onRoosterNight,
                onOff: onOffNight,
                onInduction: onInductionNight,
                stats: {
                    onDutyCount: onDutyNight.length,
                    emptyCount: emptyUnitsNight.length,
                    roosterCount: totalOnRooster,
                    availableSpares: availableSparesNight
                }
           }
        };
    }, [selectedDay, drivers, units, spareDrivers]);
    
    const renderList = () => {
        if (!dailyData) return <p>Select a valid day.</p>;

        const currentShiftData = activeShift === 'day' ? dailyData.day : dailyData.night;
        
        const tableHeader = (cols: string[]) => (
            <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                    {cols.map(col => (
                        <th key={col} scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                            {col}
                        </th>
                    ))}
                </tr>
            </thead>
        );

        const renderEmptyUnits = (data: EmptyUnitInfo[]) => (
             <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    {tableHeader(['Unit', 'Shift Empty', 'Absent Driver', 'Reason'])}
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                        {data.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-slate-100">{item.unitName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">{item.shift}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">{item.absentDriver.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm"><StatusBadge status={item.status} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );

        const renderDriverStatus = (data: DriverStatusInfo[], showShift: boolean = false) => (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    {tableHeader(showShift ? ['Driver Name', 'Unit', 'Shift'] : ['Driver Name', 'Unit'])}
                     <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                        {data.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-slate-100">{item.driver.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">{item.driver.unit}</td>
                                {showShift && <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">{item.shift}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
        
        const lists: {[key: string]: JSX.Element} = {
            'on_duty': renderDriverStatus(currentShiftData.onDuty),
            'empty_units': renderEmptyUnits(currentShiftData.emptyUnits),
            'rooster': renderDriverStatus(currentShiftData.onRooster, true),
            'off': renderDriverStatus(currentShiftData.onOff, true),
            'induction': renderDriverStatus(currentShiftData.onInduction, true),
        };

        const dataForTab = (tabKey: string) => {
             switch(tabKey) {
                case 'on_duty': return currentShiftData.onDuty;
                case 'empty_units': return currentShiftData.emptyUnits;
                case 'rooster': return currentShiftData.onRooster;
                case 'off': return currentShiftData.onOff;
                case 'induction': return currentShiftData.onInduction;
                default: return [];
            }
        }

        const data = dataForTab(activeDetailTab);
        if (data.length === 0) {
            return <div className="text-center py-10 text-slate-500 dark:text-slate-400">No data available for this category on the selected day.</div>;
        }

        return lists[activeDetailTab];
    };

    const detailTabs = [
        { key: 'on_duty', label: 'On Duty' },
        { key: 'empty_units', label: 'DT Kosong' },
        { key: 'rooster', label: 'Cuti Rooster' },
        { key: 'off', label: 'OFF' },
        { key: 'induction', label: 'Induksi' },
    ];
    
    const currentStats = activeShift === 'day' ? dailyData?.day.stats : dailyData?.night.stats;

    return (
        <div className="min-h-screen font-sans text-slate-800 dark:text-slate-200 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Manpower & Equipment Dashboard</h1>
                    <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">Daily operational overview for workforce and vehicle availability.</p>
                </header>

                <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl shadow-lg mb-8">
                     <label htmlFor="day-selector" className="block text-lg font-medium text-slate-700 dark:text-slate-300 mb-3">
                        Select Day: <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedDay}</span>
                    </label>
                    <input
                        id="day-selector"
                        type="range"
                        min="1"
                        max="31"
                        value={selectedDay}
                        onChange={(e) => setSelectedDay(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                    />
                </div>
                
                <div className="mb-8">
                    <div className="flex space-x-2 bg-slate-200 dark:bg-slate-900/50 p-1 rounded-xl">
                        <button 
                            onClick={() => setActiveShift('day')}
                            className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors duration-200 ${activeShift === 'day' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>
                            ☀️ Day Shift
                        </button>
                        <button 
                            onClick={() => setActiveShift('night')}
                            className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors duration-200 ${activeShift === 'night' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>
                            🌙 Night Shift
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <DashboardCard title="On Duty" value={currentStats?.onDutyCount || 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.284-1.255-.758-1.685M3 12a9 9 0 0118 0v2c0 .653-.284 1.255-.758 1.685M3 12a9 9 0 0118 0-9 9 0 01-18 0z" /></svg>} color="bg-teal-500" />
                    <DashboardCard title="DT Kosong" value={currentStats?.emptyCount || 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} color="bg-red-500" />
                    <DashboardCard title="Driver Cuti" value={currentStats?.roosterCount || 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} color="bg-blue-500" />
                    <DashboardCard title="Driver Spare" value={currentStats?.availableSpares || 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21v-1a6 6 0 00-5.176-5.97M15 21h6m-6-1a6 6 0 00-9-5.197M15 21h-6a6 6 0 00-6-6v-1a6 6 0 0112 0v1zm0 0v-1a6 6 0 00-5.176-5.97m5.176 5.97A6 6 0 0121 15v1h-6m-6-1a6 6 0 016-6v-1a6 6 0 00-9 5.197m9-5.197a4 4 0 110-5.292" /></svg>} color="bg-green-500" />
                </div>

                <div className="bg-white dark:bg-slate-800/50 rounded-2xl shadow-lg">
                    <div className="border-b border-slate-200 dark:border-slate-700">
                        <nav className="-mb-px flex space-x-6 px-6 overflow-x-auto" aria-label="Tabs">
                            {detailTabs.map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveDetailTab(tab.key)}
                                    className={`${
                                        activeDetailTab === tab.key
                                            ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-500'
                                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                    <div className="p-2 sm:p-4">
                        {renderList()}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default App;
