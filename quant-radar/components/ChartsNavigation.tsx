"use client";
import {createContext,useContext} from 'react';
export const ChartsNavigationContext=createContext({hidden:false,toggle:()=>{}});
export const useChartsNavigation=()=>useContext(ChartsNavigationContext);
