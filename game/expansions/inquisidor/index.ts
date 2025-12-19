import { ExpansionPlugin } from '../types'
import { HookManager } from '../../hooks/HookManager'

/**
 * Inquisidor Expansion
 * 
 * Adds investigation token mechanics:
 * - One player holds the Inquisidor token (visible to all)
 * - After each mission, token holder investigates one player's role (secret)
 * - Token passes to investigated player
 * - Cannot investigate same player twice consecutively
 * 
 * State Persistence:
 * - We store 'playerId' (UUID) in server state to persist across reconnections (socket changes).
 * - We convert to 'socket.id' when communicating with clients (UI uses socket IDs).
 */
export const InquisidorExpansion: ExpansionPlugin = {
    id: 'inquisidor',
    name: 'Inquisidor',
    version: '1.0.0',

    install(hookManager: HookManager, io?: any) {
        console.log('[Inquisidor] Installing expansion...')

        let ioInstance = io

        // Helper to get socket ID from UUID
        const getSocketId = (room: any, playerId: string | null) => {
            if (!playerId) return null
            return room.players.find((p: any) => p.playerId === playerId)?.id || null
        }

        if (ioInstance) {
            ioInstance.on('connection', (socket: any) => {
                // Handle client requests for initial token state
                socket.on('get-inquisitor-token', () => {
                    const room = socket.room
                    if (room && room.inquisitorState) {
                        // Store: UUID -> Send: SocketID
                        const holderSocketId = getSocketId(room, room.inquisitorState.tokenHolder)
                        const lastInvestigatedSocketId = getSocketId(room, room.inquisitorState.lastInvestigated)

                        socket.emit('inquisitor:token-passed', {
                            newTokenHolder: holderSocketId,
                            investigatedPlayer: lastInvestigatedSocketId
                        })
                        console.log('[Inquisidor] Sent token state to requesting client')
                    }
                })

                // Listen for game start to broadcast initial token
                socket.on('start_game', () => {
                    const room = socket.room
                    if (room && room.inquisitorState) {
                        const holderSocketId = getSocketId(room, room.inquisitorState.tokenHolder)
                        setTimeout(() => {
                            ioInstance.to(room.id).emit('inquisitor:token-passed', {
                                newTokenHolder: holderSocketId,
                                investigatedPlayer: null
                            })
                            console.log('[Inquisidor] Broadcasted initial token to room:', room.id)
                        }, 500)
                    }
                })

                socket.on('inquisitor:end-investigation', () => {
                    const room = socket.room
                    if (room && room.phase === 'INQUISITOR_INVESTIGATION') {
                        if (room.succeededMissions >= 3) {
                            room.phase = 'GAME_OVER'
                            room.winner = 'RESISTANCE'
                            ioInstance.to(room.id).emit('game_over', {
                                winner: 'RESISTANCE',
                                players: room.players
                            })
                        } else if (room.failedMissions >= 3) {
                            room.phase = 'GAME_OVER'
                            room.winner = 'SPY'
                            ioInstance.to(room.id).emit('game_over', {
                                winner: 'SPY',
                                players: room.players
                            })
                        } else {
                            // Start next round
                            room.nextTurn()

                            // Notify clients
                            ioInstance.to(room.id).emit('phase_change', { phase: 'TEAM_SELECTION' })
                            ioInstance.to(room.id).emit('new_leader', {
                                currentLeader: room.players[room.currentLeaderIndex],
                                missionIndex: room.currentMissionIndex,
                                missionSize: room.getCurrentMissionSize()
                            })
                        }
                    }
                })

                socket.on('inquisitor:investigate', ({ targetId }: { targetId: string }) => {
                    const room = socket.room
                    if (!room || !room.inquisitorState) {
                        console.error('[Inquisidor] Investigation failed: no room or inquisitor state')
                        return
                    }

                    // 1. Identify Investigator (Current Socket)
                    const investigator = room.players.find((p: any) => p.id === socket.id)
                    if (!investigator) {
                        console.error('[Inquisidor] Investigation failed: investigator not found')
                        return
                    }

                    // 2. Validate Token Holder (using UUID)
                    // room.inquisitorState.tokenHolder is provided as UUID
                    if (room.inquisitorState.tokenHolder !== investigator.playerId) {
                        console.error(`[Inquisidor] ${investigator.nickname} is not the token holder`)
                        socket.emit('error', { message: 'Você não possui o token de Inquisidor' })
                        return
                    }

                    // 3. Identify Target (Socket ID -> Player Object -> UUID)
                    const target = room.players.find((p: any) => p.id === targetId)
                    if (!target) {
                        console.error('[Inquisidor] Target player not found')
                        return
                    }

                    // 4. Validate Logic (Self & Repeat)
                    if (target.playerId === investigator.playerId) {
                        console.error('[Inquisidor] Cannot investigate self')
                        socket.emit('error', { message: 'Você não pode investigar a si mesmo' })
                        return
                    }

                    if (room.inquisitorState.lastInvestigated === target.playerId) {
                        console.error('[Inquisidor] Cannot investigate same player consecutively')
                        socket.emit('error', { message: 'Você não pode investigar o mesmo jogador duas vezes seguidas' })
                        return
                    }

                    // 5. Perform Investigation
                    const investigationResult = {
                        targetId: target.id, // Client needs Socket ID for UI
                        targetNickname: target.nickname,
                        role: target.role,
                        specialRole: target.specialRole || null
                    }

                    console.log(`[Inquisidor] ${investigator.nickname} investigated ${target.nickname}`)

                    // Send result ONLY to investigator
                    socket.emit('inquisitor:investigation-result', investigationResult)

                    // 6. Update State (Store UUIDs)
                    room.inquisitorState.tokenHolder = target.playerId
                    room.inquisitorState.lastInvestigated = target.playerId
                    room.inquisitorState.investigationHistory.push({
                        investigator: investigator.playerId,
                        target: target.playerId,
                        timestamp: Date.now()
                    })

                    // 7. Notify all players (Send Socket IDs)
                    ioInstance.to(room.id).emit('inquisitor:token-passed', {
                        newTokenHolder: target.id, // Send Socket ID
                        investigatedPlayer: target.id // Send Socket ID
                    })

                    console.log(`[Inquisidor] Token passed from ${investigator.nickname} to ${target.nickname}`)
                })
            })
        }

        // Hook: Initialize token holder at game start
        hookManager.register('game:start', (context) => {
            const { room } = context

            // Select random player to start with token
            const randomIdx = Math.floor(Math.random() * room.players.length)
            const initialHolder = room.players[randomIdx]

            // Initialize inquisitor state (Store UUIDs)
            room.inquisitorState = {
                tokenHolder: initialHolder.playerId,
                lastInvestigated: null,
                investigationHistory: []
            }

            console.log(`[Inquisidor] Initial token holder: ${initialHolder.nickname} (${initialHolder.playerId})`)

            // Add token state to context (Convert to SocketID for client)
            context.inquisitorToken = {
                holder: initialHolder.id,
                lastInvestigated: null
            }

            // Allow time for game_started to be sent, then broadcast token (redundancy)
            if (ioInstance && room.id) {
                setTimeout(() => {
                    ioInstance.to(room.id).emit('inquisitor:token-passed', {
                        newTokenHolder: initialHolder.id, // Socket ID
                        investigatedPlayer: null
                    })
                    console.log('[Inquisidor] Broadcasted initial token state to room:', room.id)
                }, 1000)
            }

            return context
        })

        // Hook: Add investigation phase after mission resolves (if game continues)
        hookManager.register('mission:resolve', (context) => {
            const { room, nextPhase } = context

            // Only add investigation phase if game continues (not ending)
            if (nextPhase !== 'GAME_OVER' && nextPhase !== 'ASSASSINATION') {
                console.log('[Inquisidor] Mission resolved, adding INQUISITOR_INVESTIGATION phase')
                context.nextPhase = 'INQUISITOR_INVESTIGATION'
            } else {
                console.log(`[Inquisidor] Skipping investigation phase, game ending with ${nextPhase}`)
            }

            return context
        })

        // Hook: Sync token state to all players
        hookManager.register('state:sync', (context) => {
            const { room, state } = context

            // Add token state (visible to all)
            if (room.inquisitorState) {
                // Convert stored UUIDs to Socket IDs for client state
                const holder = room.players.find((p: any) => p.playerId === room.inquisitorState.tokenHolder)
                const investigated = room.players.find((p: any) => p.playerId === room.inquisitorState.lastInvestigated)

                context.state.inquisitorToken = {
                    holder: holder ? holder.id : null,
                    lastInvestigated: investigated ? investigated.id : null
                }
                console.log('[Inquisidor] Syncing token state to player:', context.state.inquisitorToken)
            }

            return context
        })

        console.log('[Inquisidor] Expansion installed successfully')
    },

    registerSocketHandlers(socket: any, room: any, io: any) {
        //  Handle investigation
        socket.on('inquisitor:investigate', ({ targetId }: { targetId: string }) => {
            if (!room || !room.inquisitorState) {
                console.error('[Inquisidor] Investigation failed: no room or inquisitor state')
                return
            }

            const investigator = room.players.find((p: any) => p.id === socket.id)
            if (!investigator) {
                console.error('[Inquisidor] Investigation failed: investigator not found')
                return
            }

            if (room.inquisitorState.tokenHolder !== investigator.playerId) {
                console.error(`[Inquisidor] ${investigator.nickname} is not the token holder`)
                socket.emit('error', { message: 'Você não possui o token de Inquisidor' })
                return
            }

            const target = room.players.find((p: any) => p.id === targetId)
            if (!target) {
                console.error('[Inquisidor] Target player not found')
                return
            }

            if (target.playerId === investigator.playerId) {
                console.error('[Inquisidor] Cannot investigate self')
                socket.emit('error', { message: 'Você não pode investigar a si mesmo' })
                return
            }

            if (room.inquisitorState.lastInvestigated === target.playerId) {
                console.error('[Inquisidor] Cannot investigate same player consecutively')
                socket.emit('error', { message: 'Você não pode investigar o mesmo jogador duas vezes seguidas' })
                return
            }

            const investigationResult = {
                targetId: target.id,
                targetNickname: target.nickname,
                role: target.role,
                specialRole: target.specialRole || null
            }

            console.log(`[Inquisidor] ${investigator.nickname} investigated ${target.nickname}`)
            socket.emit('inquisitor:investigation-result', investigationResult)

            room.inquisitorState.tokenHolder = target.playerId
            room.inquisitorState.lastInvestigated = target.playerId
            room.inquisitorState.investigationHistory.push({
                investigator: investigator.playerId,
                target: target.playerId,
                timestamp: Date.now()
            })

            io.to(room.id).emit('inquisitor:token-passed', {
                newTokenHolder: target.id,
                investigatedPlayer: target.id
            })

            console.log(`[Inquisidor] Token passed from ${investigator.nickname} to ${target.nickname}`)
        })

        // Handle end of investigation phase
        socket.on('inquisitor:end-investigation', () => {
            if (room && room.phase === 'INQUISITOR_INVESTIGATION') {
                if (room.succeededMissions >= 3) {
                    room.phase = 'GAME_OVER'
                    io.to(room.id).emit('game_over', {
                        winner: 'RESISTANCE',
                        players: room.players.map((p: any) => ({
                            id: p.id,
                            nickname: p.nickname,
                            role: p.role,
                            specialRole: p.specialRole || null,
                        }))
                    })
                } else if (room.failedMissions >= 3) {
                    room.phase = 'GAME_OVER'
                    io.to(room.id).emit('game_over', {
                        winner: 'SPY',
                        players: room.players.map((p: any) => ({
                            id: p.id,
                            nickname: p.nickname,
                            role: p.role,
                            specialRole: p.specialRole || null,
                        }))
                    })
                } else {
                    room.nextTurn()
                    io.to(room.id).emit('phase_change', { phase: 'TEAM_SELECTION' })
                    io.to(room.id).emit('new_leader', {
                        currentLeader: room.players[room.currentLeaderIndex],
                        missionIndex: room.currentMissionIndex,
                        missionSize: room.getCurrentMissionSize()
                    })
                }
            }
        })
    },

    uninstall(hookManager: HookManager) {
        console.log('[Inquisidor] Uninstalling expansion...')
        // Hooks are automatically cleared by HookManager
        // Socket events would need to be removed if we track them
    }
}
